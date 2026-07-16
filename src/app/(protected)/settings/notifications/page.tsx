"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, Skeleton } from "@/components/ui";
import {
  fetchNotificationPrefs,
  updateNotificationPrefs,
  type NotificationCategory,
  type NotificationPrefs,
} from "@/lib/notifications";

const CATEGORY_ROWS: { key: NotificationCategory; label: string; helper: string }[] = [
  { key: "money", label: "Money events", helper: "Deposits, releases, refunds" },
  { key: "lease", label: "Lease lifecycle", helper: "Signatures, activation" },
  { key: "maintenance", label: "Maintenance", helper: "Issue reports and status updates" },
  { key: "dispute", label: "Disputes", helper: "Raised, resolved" },
  { key: "messages", label: "Messages & reviews", helper: "New messages, payment reminders, reviews" },
];

export default function NotificationSettingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchNotificationPrefs(session.email).then(setPrefs);
  }, [session]);

  if (isLoading || !session) return null;

  const toggle = async (key: NotificationCategory) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    await updateNotificationPrefs(session.email, { [key]: next[key] });
  };

  return (
    <>
      <p className="text-sm text-ink-muted">Choose what shows up in your notification bell.</p>

      <Card className="mt-4">
        <CardContent className="pt-6">
          {prefs === null ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <div className="flex flex-col divide-y divide-forest-100">
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 pb-3 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <span>Category</span>
                <span className="text-center">In-app</span>
                <span className="text-center">Email</span>
                <span className="text-center">Push</span>
              </div>
              {CATEGORY_ROWS.map((row) => (
                <div key={row.key} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 py-4">
                  <div>
                    <p className="text-sm font-medium text-ink">{row.label}</p>
                    <p className="text-xs text-ink-soft">{row.helper}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={prefs[row.key]}
                    onClick={() => toggle(row.key)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      prefs[row.key] ? "bg-forest-500" : "bg-cream-400"
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-4 w-4 rounded-full bg-cream-50 transition-transform ${
                        prefs[row.key] ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                  <span
                    title="Email delivery isn't set up yet"
                    className="flex h-6 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-cream-400 text-[10px] font-medium text-ink-soft"
                  >
                    Soon
                  </span>
                  <span
                    title="Push delivery isn't set up yet"
                    className="flex h-6 w-11 shrink-0 cursor-not-allowed items-center justify-center rounded-full bg-cream-400 text-[10px] font-medium text-ink-soft"
                  >
                    Soon
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-ink-soft">
        Email and push notifications aren&apos;t wired up yet — in-app is the only real delivery channel right
        now. Disputes and money events are always treated as high-priority in the bell regardless of these
        settings.
      </p>
    </>
  );
}
