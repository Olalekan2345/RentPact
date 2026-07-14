import type { EvidenceEntry } from "@/lib/evidenceTimeline";
import { formatDate } from "@/lib/format";
import { CameraIcon, WrenchIcon, ScaleIcon, ClockIcon, FrostIcon } from "@/components/icons/TimelineIcons";
import { MessagesIcon } from "@/components/icons/NavIcons";

function EntryIcon({ kind, tone }: { kind: EvidenceEntry["kind"]; tone?: EvidenceEntry["tone"] }) {
  const cls = tone === "warning" ? "text-terracotta-500 bg-terracotta-100" : "text-forest-500 bg-forest-100";
  const Icon =
    kind === "baseline"
      ? CameraIcon
      : kind === "issue"
        ? FrostIcon
        : kind === "acknowledgment"
          ? ClockIcon
          : kind === "repair"
            ? WrenchIcon
            : kind === "dispute-raised"
              ? ScaleIcon
              : MessagesIcon;
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cls}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

/**
 * The centerpiece of the dispute detail page — a shared, chronological
 * record both parties see identically. Article 4.4: "the arbitration panel
 * reviews the automatically assembled evidence timeline." Each entry's
 * on-chain-style hash (where one exists) is shown in mono text so it can be
 * independently verified.
 */
export function EvidenceTimeline({ entries }: { entries: EvidenceEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-ink-soft">No evidence has been assembled for this dispute yet.</p>;
  }

  return (
    <ol className="relative">
      {entries.map((entry, i) => (
        <li key={entry.id} className="flex gap-3 pb-6 last:pb-0">
          <div className="flex flex-col items-center">
            <EntryIcon kind={entry.kind} tone={entry.tone} />
            {i < entries.length - 1 && <div className="mt-1 w-px flex-1 bg-forest-100" />}
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <p className={`text-sm font-medium ${entry.tone === "warning" ? "text-terracotta-600" : "text-ink"}`}>
              {entry.title}
            </p>
            {entry.timestamp !== null && (
              <p className="mt-0.5 text-xs text-ink-soft">{formatDate(new Date(entry.timestamp), "long")}</p>
            )}
            {entry.body && <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-muted">{entry.body}</p>}
            {entry.hash && <p className="mt-1.5 break-all font-mono text-[11px] text-ink-soft">sha256:{entry.hash}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
