import type { ConditionDeclaration } from "@/lib/condition";
import type { Message } from "@/lib/messages";
import { RESOLUTION_WINDOW_MS, ACKNOWLEDGMENT_WINDOW_MS, type IssueSeverity } from "@/lib/constitution";

export interface EvidenceEntry {
  id: string;
  kind: "baseline" | "issue" | "acknowledgment" | "message" | "repair" | "dispute-raised";
  title: string;
  timestamp: number | null;
  body?: string;
  hash?: string | null;
  tone?: "default" | "warning";
}

/** Parses the `Issue report [id] (category): description — note` format RaiseDisputeModal composes. */
export function parseIssueReference(disputeReason: string | null): { messageId: string; note: string } | null {
  if (!disputeReason) return null;
  const match = disputeReason.match(/^Issue report \[([^\]]+)\] \([^)]+\): [\s\S]*?(?: — ([\s\S]*))?$/);
  if (!match) return null;
  return { messageId: match[1], note: match[2] ?? "" };
}

/**
 * Assembles the shared Evidence Timeline for a dispute — Article 4.4: "the
 * arbitration panel reviews the automatically assembled evidence timeline."
 * Built entirely from records that already exist elsewhere in the product
 * (condition baseline, issue reports, message thread, dispute timestamps) —
 * nothing here is fabricated or dispute-specific storage of its own.
 */
export function buildEvidenceTimeline(params: {
  condition: ConditionDeclaration | null;
  thread: Message[];
  disputeReason: string | null;
  disputeRaisedAt: number | null;
  tenantEmail: string;
}): EvidenceEntry[] {
  const entries: EvidenceEntry[] = [];
  const ref = parseIssueReference(params.disputeReason);
  const issueMessage = ref ? params.thread.find((m) => m.id === ref.messageId) ?? null : null;

  if (params.condition) {
    entries.push({
      id: "baseline",
      kind: "baseline",
      title: "Baseline condition recorded",
      timestamp: params.condition.declaredAt,
      body: params.condition.knownDefects
        ? `Known defects disclosed at signing: ${params.condition.knownDefects}`
        : "No known defects disclosed at signing.",
      hash: params.condition.hash,
    });
  }

  if (issueMessage?.maintenance) {
    const m = issueMessage.maintenance;
    entries.push({
      id: `issue-${issueMessage.id}`,
      kind: "issue",
      title: `Issue Report filed — ${m.category}`,
      timestamp: issueMessage.createdAt,
      body: m.description,
      hash: null,
    });

    if (m.acknowledgedAt) {
      const hours = Math.round((m.acknowledgedAt - issueMessage.createdAt) / (60 * 60 * 1000));
      const overdue = m.acknowledgedAt - issueMessage.createdAt > ACKNOWLEDGMENT_WINDOW_MS;
      entries.push({
        id: `ack-${issueMessage.id}`,
        kind: "acknowledgment",
        title: overdue ? `Acknowledged late — after ${hours}h (Article 3.2 window is 48h)` : `Acknowledged after ${hours}h`,
        timestamp: m.acknowledgedAt,
        tone: overdue ? "warning" : "default",
      });
    } else {
      entries.push({
        id: `ack-missing-${issueMessage.id}`,
        kind: "acknowledgment",
        title: "Never acknowledged — Escalation Rule 3.5 triggered",
        timestamp: null,
        tone: "warning",
      });
    }

    if (m.resolvedAt) {
      entries.push({
        id: `repair-${issueMessage.id}`,
        kind: "repair",
        title: "Landlord marked the issue resolved",
        timestamp: m.resolvedAt,
      });
    } else {
      const window = RESOLUTION_WINDOW_MS[m.severity as IssueSeverity] ?? RESOLUTION_WINDOW_MS.cosmetic;
      const overdue = m.acknowledgedAt !== null && Date.now() - m.acknowledgedAt > window;
      entries.push({
        id: `repair-missing-${issueMessage.id}`,
        kind: "repair",
        title: overdue ? "No repair record — resolution window has passed" : "No repair record yet",
        timestamp: null,
        tone: overdue ? "warning" : "default",
      });
    }
  }

  const relevantMessages = params.thread.filter(
    (m) => m.type === "text" && (!issueMessage || m.createdAt >= issueMessage.createdAt),
  );
  for (const m of relevantMessages) {
    entries.push({
      id: `msg-${m.id}`,
      kind: "message",
      title: m.fromEmail === params.tenantEmail ? "Tenant message" : "Landlord message",
      timestamp: m.createdAt,
      body: m.text,
    });
  }

  if (params.disputeRaisedAt) {
    entries.push({
      id: "dispute-raised",
      kind: "dispute-raised",
      title: "Dispute raised",
      timestamp: params.disputeRaisedAt,
      body: ref?.note || undefined,
    });
  }

  return entries
    .filter((e) => e.timestamp !== null || e.kind === "acknowledgment" || e.kind === "repair")
    .sort((a, b) => (a.timestamp ?? Infinity) - (b.timestamp ?? Infinity));
}
