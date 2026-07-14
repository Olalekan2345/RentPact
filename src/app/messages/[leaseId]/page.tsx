"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { PropertyImage } from "@/components/PropertyImage";
import { Badge, Button, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { resizeImageToDataUrl, fileToDataUrl } from "@/lib/image";
import { CONDITION_AREAS, type ConditionAreaKey } from "@/lib/condition";
import {
  SEVERITY_OPTIONS,
  acknowledgmentDeadline,
  resolutionDeadline,
  isAcknowledgmentOverdue,
  isResolutionOverdue,
  isEscalatedOnTiming,
  type IssueSeverity,
} from "@/lib/constitution";
import { getLease, type Lease } from "@/lib/leaseData";
import {
  fetchThread,
  sendTextMessage,
  sendMaintenanceRequest,
  sendPaymentReminder,
  markThreadRead,
  updateMaintenanceStatus,
  PAYMENT_REMINDER_TEMPLATES,
  type Message,
  type MaintenanceCategory,
  type MaintenanceStatus,
} from "@/lib/messages";

const CATEGORY_OPTIONS: { value: MaintenanceCategory; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "structural", label: "Structural" },
  { value: "security", label: "Security" },
  { value: "pest", label: "Pest" },
  { value: "other", label: "Other" },
];

const NEXT_STATUS: Record<MaintenanceStatus, MaintenanceStatus | null> = {
  reported: "acknowledged",
  acknowledged: "in-progress",
  "in-progress": "resolved",
  resolved: null,
};

const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  reported: "Reported",
  acknowledged: "Acknowledged",
  "in-progress": "In progress",
  resolved: "Resolved",
};

const STATUS_ACTION_LABEL: Record<string, string> = {
  acknowledged: "Acknowledge",
  "in-progress": "Mark in progress",
  resolved: "Mark resolved",
};

export default function MessageThreadPage() {
  const { leaseId } = useParams<{ leaseId: string }>();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [lease, setLease] = useState<Lease | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [category, setCategory] = useState<MaintenanceCategory>("plumbing");
  const [area, setArea] = useState<ConditionAreaKey | "">("");
  const [severity, setSeverity] = useState<IssueSeverity>("affects-daily-living");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [submittingMaintenance, setSubmittingMaintenance] = useState(false);

  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  const refresh = useCallback(async () => {
    const msgs = await fetchThread(leaseId);
    setMessages(msgs);
  }, [leaseId]);

  useEffect(() => {
    getLease(leaseId).then(setLease);
  }, [leaseId]);

  useEffect(() => {
    if (!session) return;
    refresh().then(() => markThreadRead({ leaseId }, session.email).then(refresh));
  }, [session, leaseId, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading || !session || lease === undefined) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  if (lease === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">Lease not found.</div>
      </AppShell>
    );
  }

  const viewerRole: "tenant" | "landlord" | "guest" =
    lease.tenantEmail === session.email ? "tenant" : lease.landlordEmail === session.email ? "landlord" : "guest";
  if (viewerRole === "guest") {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">
          You&apos;re not party to this lease.
        </div>
      </AppShell>
    );
  }

  const counterpartyEmail = viewerRole === "tenant" ? lease.landlordEmail : lease.tenantEmail;

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendTextMessage({ leaseId, fromEmail: session.email, toEmail: counterpartyEmail, text: text.trim() });
      setText("");
      await refresh();
    } finally {
      setSending(false);
    }
  };

  const handlePhotoAdd = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setMaintenanceError(null);
    if (file.size > 5 * 1024 * 1024) {
      setMaintenanceError("Image must be under 5MB.");
      return;
    }
    setUploadingPhoto(true);
    try {
      const url = await resizeImageToDataUrl(file, 800);
      setPhotos((prev) => [...prev, url]);
    } catch {
      setMaintenanceError("Could not read that image. Try a different file.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleVideoAdd = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = "";
    if (!file) return;
    setMaintenanceError(null);
    if (file.size > 20 * 1024 * 1024) {
      setMaintenanceError("Video must be under 20MB.");
      return;
    }
    setUploadingVideo(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setVideoUrl(dataUrl);
    } catch {
      setMaintenanceError("Could not read that video. Try a different file.");
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSubmitMaintenance = async () => {
    if (!description.trim()) {
      setMaintenanceError("Describe the issue.");
      return;
    }
    if (photos.length === 0 && !videoUrl) {
      setMaintenanceError("Attach at least one photo or video — Article 3.1 requires evidence.");
      return;
    }
    setSubmittingMaintenance(true);
    setMaintenanceError(null);
    try {
      await sendMaintenanceRequest({
        leaseId,
        fromEmail: session.email,
        toEmail: counterpartyEmail,
        category,
        area: area || null,
        description: description.trim(),
        photos,
        videoUrl,
        severity,
      });
      setDescription("");
      setPhotos([]);
      setVideoUrl(null);
      setCategory("plumbing");
      setArea("");
      setSeverity("affects-daily-living");
      setShowMaintenanceForm(false);
      await refresh();
    } catch (err) {
      setMaintenanceError(err instanceof Error ? err.message : "Could not submit the request.");
    } finally {
      setSubmittingMaintenance(false);
    }
  };

  const handleSendReminder = async (template: string) => {
    setSendingReminder(true);
    try {
      await sendPaymentReminder({ leaseId, fromEmail: session.email, toEmail: counterpartyEmail, template });
      setShowReminderPicker(false);
      await refresh();
    } finally {
      setSendingReminder(false);
    }
  };

  const handleAdvanceStatus = async (message: Message) => {
    if (!message.maintenance) return;
    const next = NEXT_STATUS[message.maintenance.status];
    if (!next) return;
    await updateMaintenanceStatus(message.id, next, session.email);
    await refresh();
  };

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-2xl flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center gap-3 border-b border-forest-100 pb-4">
          <PropertyImage
            seed={lease.id}
            propertyType={lease.propertyType}
            overrideUrl={lease.photoUrl}
            alt={lease.propertyAddress}
            className="h-11 w-11 shrink-0 rounded-md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{lease.propertyAddress}</p>
            <p className="truncate text-sm text-ink-soft">{counterpartyEmail}</p>
          </div>
          <Link href={`/leases/${lease.id}`} className="shrink-0 text-sm font-medium text-forest-500 underline">
            View lease
          </Link>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {messages === null ? (
            <Skeleton className="h-64 w-full" />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-soft">
              No messages yet — say hello, or report an issue below.
            </p>
          ) : (
            <div className="flex flex-col gap-3 pb-4">
              {messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  isOwn={m.fromEmail === session.email}
                  viewerRole={viewerRole}
                  onAdvanceStatus={m.toEmail === session.email ? () => handleAdvanceStatus(m) : undefined}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {showMaintenanceForm && (
          <div className="mb-3 flex flex-col gap-3 rounded-lg border border-forest-100 bg-cream-100 p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Report an issue</p>
              <p className="text-xs text-ink-soft">Article III — the landlord has 48 hours to acknowledge.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setCategory(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    category === opt.value ? "border-forest-400 bg-forest-50 text-forest-500" : "border-forest-100 text-ink-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-muted">Declared area (optional)</label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as ConditionAreaKey | "")}
                className="h-10 rounded-md border border-forest-100 bg-cream-50 px-3 text-sm text-ink"
              >
                <option value="">Not linked to a declared area</option>
                {CONDITION_AREAS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-soft">
                Linking an area lets us check it against the Property Condition Declaration
                automatically (Disclosure Shield &amp; Maintenance Matrix, Article 2.3/2.5).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeverity(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                    severity === opt.value ? "border-gold-400 bg-gold-50 text-gold-600" : "border-forest-100 text-ink-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <textarea
              placeholder="Describe the issue…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="rounded-md border border-forest-100 bg-cream-50 px-3 py-2 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer text-sm font-medium text-forest-500 underline">
                {uploadingPhoto ? "Uploading…" : "Add photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploadingPhoto}
                  onChange={handlePhotoAdd}
                />
              </label>
              <label className="cursor-pointer text-sm font-medium text-forest-500 underline">
                {uploadingVideo ? "Uploading…" : "Add video"}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  disabled={uploadingVideo}
                  onChange={handleVideoAdd}
                />
              </label>
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p} alt="" className="h-10 w-10 rounded-md object-cover" />
              ))}
              {videoUrl && <video src={videoUrl} controls className="h-10 rounded-md" />}
            </div>
            {maintenanceError && <p className="text-sm text-terracotta-500">{maintenanceError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmitMaintenance} disabled={submittingMaintenance}>
                {submittingMaintenance ? "Sending…" : "Send request"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowMaintenanceForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {showReminderPicker && (
          <div className="mb-3 flex flex-col gap-2 rounded-lg border border-forest-100 bg-cream-100 p-4">
            <p className="text-sm font-semibold text-ink">Send a payment reminder</p>
            {PAYMENT_REMINDER_TEMPLATES.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => handleSendReminder(template)}
                disabled={sendingReminder}
                className="rounded-md border border-forest-100 px-3 py-2 text-left text-sm text-ink-muted transition-colors hover:border-forest-300 hover:bg-forest-50"
              >
                {template}
              </button>
            ))}
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setShowReminderPicker(false)}>
              Cancel
            </Button>
          </div>
        )}

        <div className="flex gap-2 pb-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowMaintenanceForm((v) => !v);
              setShowReminderPicker(false);
            }}
          >
            Report an issue
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setShowReminderPicker((v) => !v);
              setShowMaintenanceForm(false);
            }}
          >
            Send reminder
          </Button>
        </div>

        <form onSubmit={handleSend} className="flex gap-2 border-t border-forest-100 pt-3">
          <input
            type="text"
            placeholder="Write a message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="h-11 flex-1 rounded-md border border-forest-100 bg-cream-50 px-4 text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
          />
          <Button type="submit" disabled={sending || !text.trim()}>
            Send
          </Button>
        </form>
      </div>
    </AppShell>
  );
}

function MessageBubble({
  message,
  isOwn,
  viewerRole,
  onAdvanceStatus,
}: {
  message: Message;
  isOwn: boolean;
  viewerRole: "tenant" | "landlord";
  onAdvanceStatus?: () => void;
}) {
  if (message.type === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-cream-400 px-3 py-1 text-xs text-ink-soft">{message.text}</span>
      </div>
    );
  }

  const bubbleAlign = isOwn ? "items-end self-end" : "items-start self-start";
  const bubbleColor = isOwn ? "bg-forest-500 text-cream-50" : "bg-cream-200 text-ink";

  if (message.type === "maintenance" && message.maintenance) {
    const m = message.maintenance;
    const next = NEXT_STATUS[m.status];
    const timing = { reportedAt: message.createdAt, acknowledgedAt: m.acknowledgedAt, resolvedAt: m.resolvedAt, severity: m.severity };
    const ackOverdue = isAcknowledgmentOverdue(timing);
    const resOverdue = isResolutionOverdue(timing);
    const escalated = isEscalatedOnTiming(timing);
    const canRaiseDispute = viewerRole === "tenant" && isOwn && escalated && m.status !== "resolved";

    return (
      <div className={`flex max-w-[85%] flex-col gap-1 ${bubbleAlign}`}>
        <div className="w-full rounded-lg border border-terracotta-100 bg-terracotta-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-terracotta-600">
              Issue · {m.category}
            </span>
            <Badge variant={m.status === "resolved" ? "forest" : m.severity === "urgent-safety" ? "terracotta" : "gold"}>
              {STATUS_LABEL[m.status]}
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-ink">{m.description}</p>
          {m.photos.length > 0 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {m.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
              ))}
            </div>
          )}
          {m.videoUrl && <video src={m.videoUrl} controls className="mt-2 w-full rounded-md" />}
          <p className="mt-1.5 text-xs text-ink-soft">
            Severity: {SEVERITY_OPTIONS.find((s) => s.value === m.severity)?.label}
          </p>

          {m.status === "reported" && (
            <p className={`mt-1 text-xs ${ackOverdue ? "font-medium text-terracotta-600" : "text-ink-soft"}`}>
              {ackOverdue ? "Acknowledgment overdue (Article 3.2)" : `Acknowledgment due ${formatDate(new Date(acknowledgmentDeadline(message.createdAt)), "long")}`}
            </p>
          )}
          {m.acknowledgedAt && m.status !== "resolved" && (
            <p className={`mt-1 text-xs ${resOverdue ? "font-medium text-terracotta-600" : "text-ink-soft"}`}>
              {resOverdue ? "Resolution overdue (Article 3.3)" : `Resolution due ${formatDate(new Date(resolutionDeadline(m.acknowledgedAt, m.severity)), "long")}`}
            </p>
          )}

          {escalated && m.status !== "resolved" && (
            <p className="mt-1.5 rounded-md bg-terracotta-100 px-2 py-1 text-xs font-medium text-terracotta-700">
              Escalated under Article 3.5 — eligible to raise a dispute
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {onAdvanceStatus && next && (
              <Button size="sm" variant="secondary" onClick={onAdvanceStatus}>
                {STATUS_ACTION_LABEL[next]}
              </Button>
            )}
            {canRaiseDispute && (
              <Link href={`/leases/${message.leaseId}?raiseDisputeFor=${message.id}`}>
                <Button size="sm" variant="destructive">
                  Raise dispute
                </Button>
              </Link>
            )}
          </div>
        </div>
        <MessageMeta message={message} isOwn={isOwn} />
      </div>
    );
  }

  if (message.type === "payment-reminder") {
    return (
      <div className={`flex max-w-[85%] flex-col gap-1 ${bubbleAlign}`}>
        <div className="w-full rounded-lg border border-gold-200 bg-gold-50 px-3 py-2 text-sm text-gold-700">
          🔔 {message.text}
        </div>
        <MessageMeta message={message} isOwn={isOwn} />
      </div>
    );
  }

  return (
    <div className={`flex max-w-[85%] flex-col gap-1 ${bubbleAlign}`}>
      <div className={`w-fit rounded-lg px-3 py-2 text-sm ${bubbleColor}`}>{message.text}</div>
      <MessageMeta message={message} isOwn={isOwn} />
    </div>
  );
}

function MessageMeta({ message, isOwn }: { message: Message; isOwn: boolean }) {
  return (
    <span className="px-1 text-[11px] text-ink-soft">
      {formatDate(new Date(message.createdAt), "long")}
      {isOwn && <> · {message.readAt ? `Read ${formatDate(new Date(message.readAt), "long")}` : "Sent"}</>}
    </span>
  );
}
