import "server-only";
import type { ConditionAreaKey } from "@/lib/condition";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Conversation threads. Two kinds share one store:
 *  - listing threads (leaseId null, listingId set) — a prospective tenant
 *    messaging a landlord about a property before any deposit or agreement
 *    exists.
 *  - lease threads (leaseId set) — the full negotiation/maintenance/system
 *    timeline once a lease is created. When a listing's inquiry turns into a
 *    real lease, migrateListingThreadToLease() re-parents those messages so
 *    the conversation carries over rather than starting over.
 * Visible to both parties from any device via Postgres.
 */

export type MessageType = "text" | "maintenance" | "system" | "payment-reminder";

/** Article 3.1 */
export type MaintenanceCategory = "plumbing" | "electrical" | "structural" | "security" | "pest" | "other";
/** Article 3.1 */
export type IssueSeverity = "cosmetic" | "affects-daily-living" | "urgent-safety";
export type MaintenanceStatus = "reported" | "acknowledged" | "in-progress" | "resolved";

export interface MaintenanceDetails {
  category: MaintenanceCategory;
  /** Links this Issue Report to a Property Condition Declaration area, so the Disclosure Shield and Maintenance Matrix checks (Article 2.3, 2.5) can run automatically against it. Null for issues that don't map to a declared area. */
  area: ConditionAreaKey | null;
  description: string;
  photos: string[];
  videoUrl: string | null;
  severity: IssueSeverity;
  status: MaintenanceStatus;
  /** Article 3.2 — when the landlord acknowledged, for the 48h window. */
  acknowledgedAt: number | null;
  /** Article 3.3 — when the landlord marked it resolved, for the severity-based window. */
  resolvedAt: number | null;
}

export interface Message {
  id: string;
  leaseId: string | null;
  listingId: string | null;
  fromEmail: string;
  toEmail: string;
  type: MessageType;
  text: string;
  createdAt: number;
  readAt: number | null;
  maintenance: MaintenanceDetails | null;
}

export interface Thread {
  kind: "lease" | "listing";
  leaseId: string | null;
  listingId: string | null;
  /** For listing threads only — the other party in this specific inquiry (a listing can get inquiries from many prospective tenants). */
  counterpartyEmail: string | null;
  lastMessage: Message;
  unreadCount: number;
}

function fromRow(row: {
  id: string;
  lease_id: string | null;
  listing_id: string | null;
  from_email: string;
  to_email: string;
  type: string;
  text: string;
  created_at: number;
  read_at: number | null;
  maintenance: unknown;
}): Message {
  return {
    id: row.id,
    leaseId: row.lease_id,
    listingId: row.listing_id,
    fromEmail: row.from_email,
    toEmail: row.to_email,
    type: row.type as MessageType,
    text: row.text,
    createdAt: row.created_at,
    readAt: row.read_at,
    maintenance: row.maintenance as MaintenanceDetails | null,
  };
}

export async function listMessagesForLease(leaseId: string): Promise<Message[]> {
  const { data } = await supabaseAdmin()
    .from("messages")
    .select()
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(fromRow);
}

/** Every message an email sent or received — used for the "export my data" download. */
export async function listAllMessagesForEmail(email: string): Promise<Message[]> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("messages")
    .select()
    .or(`from_email.eq.${normalized},to_email.eq.${normalized}`)
    .order("created_at", { ascending: true });
  return (data ?? []).map(fromRow);
}

/**
 * Pre-lease inquiry messages for a listing, scoped to one prospective
 * tenant — a listing can receive inquiries from several different tenants,
 * each their own private thread with the landlord. Excludes any messages
 * already migrated onto a real lease.
 */
export async function listMessagesForListing(
  listingId: string,
  viewerEmail: string,
  counterpartyEmail: string,
): Promise<Message[]> {
  const v = viewerEmail.trim().toLowerCase();
  const c = counterpartyEmail.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("messages")
    .select()
    .eq("listing_id", listingId)
    .is("lease_id", null)
    .or(`and(from_email.eq.${v},to_email.eq.${c}),and(from_email.eq.${c},to_email.eq.${v})`)
    .order("created_at", { ascending: true });
  return (data ?? []).map(fromRow);
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function threadKey(m: Message): string {
  return m.leaseId ? `lease:${m.leaseId}` : `listing:${m.listingId}:${pairKey(m.fromEmail, m.toEmail)}`;
}

/** One row per conversation (lease or listing inquiry) the email is party to — powers the inbox list. */
export async function listThreadsForEmail(email: string): Promise<Thread[]> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("messages")
    .select()
    .or(`from_email.eq.${normalized},to_email.eq.${normalized}`);
  const mine = (data ?? []).map(fromRow);

  const byThread = new Map<string, Message[]>();
  for (const m of mine) {
    const key = threadKey(m);
    const list = byThread.get(key) ?? [];
    list.push(m);
    byThread.set(key, list);
  }

  const threads: Thread[] = [...byThread.values()].map((msgs) => {
    msgs.sort((a, b) => a.createdAt - b.createdAt);
    const lastMessage = msgs[msgs.length - 1];
    const unreadCount = msgs.filter((m) => m.toEmail === normalized && m.readAt === null).length;
    const counterpartyEmail = lastMessage.fromEmail === normalized ? lastMessage.toEmail : lastMessage.fromEmail;
    return {
      kind: lastMessage.leaseId ? ("lease" as const) : ("listing" as const),
      leaseId: lastMessage.leaseId,
      listingId: lastMessage.listingId,
      counterpartyEmail: lastMessage.leaseId ? null : counterpartyEmail,
      lastMessage,
      unreadCount,
    };
  });

  return threads.sort((a, b) => b.lastMessage.createdAt - a.lastMessage.createdAt);
}

export async function createMessage(input: Omit<Message, "id" | "createdAt" | "readAt">): Promise<Message> {
  if (!input.leaseId && !input.listingId) throw new Error("A message needs a leaseId or listingId");
  const message: Message = { ...input, id: crypto.randomUUID(), createdAt: Date.now(), readAt: null };

  const { error } = await supabaseAdmin()
    .from("messages")
    .insert({
      id: message.id,
      lease_id: message.leaseId,
      listing_id: message.listingId,
      from_email: message.fromEmail,
      to_email: message.toEmail,
      type: message.type,
      text: message.text,
      created_at: message.createdAt,
      read_at: message.readAt,
      maintenance: message.maintenance,
    });
  if (error) throw error;

  return message;
}

export async function markThreadRead(
  target: { leaseId?: string; listingId?: string; counterpartyEmail?: string },
  readerEmail: string,
): Promise<void> {
  const normalized = readerEmail.trim().toLowerCase();
  const counterparty = target.counterpartyEmail?.trim().toLowerCase();

  let query = supabaseAdmin()
    .from("messages")
    .update({ read_at: Date.now() })
    .eq("to_email", normalized)
    .is("read_at", null);

  if (target.leaseId) {
    query = query.eq("lease_id", target.leaseId);
  } else {
    query = query.eq("listing_id", target.listingId ?? "").is("lease_id", null);
    if (counterparty) query = query.eq("from_email", counterparty);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function updateMaintenanceStatus(
  messageId: string,
  status: MaintenanceStatus,
  requesterEmail: string,
): Promise<Message> {
  const normalized = requesterEmail.trim().toLowerCase();
  const db = supabaseAdmin();

  const { data: existing, error: fetchError } = await db.from("messages").select().eq("id", messageId).maybeSingle();
  if (fetchError) throw fetchError;
  if (!existing) throw new Error("Message not found");

  const message = fromRow(existing);
  if (message.type !== "maintenance" || !message.maintenance) throw new Error("Not a maintenance message");
  if (message.toEmail !== normalized) throw new Error("Only the recipient can update maintenance status");

  const now = Date.now();
  const implicitlyAcknowledged = status === "acknowledged" || status === "in-progress" || status === "resolved";
  const maintenance: MaintenanceDetails = {
    ...message.maintenance,
    status,
    acknowledgedAt:
      implicitlyAcknowledged && !message.maintenance.acknowledgedAt ? now : message.maintenance.acknowledgedAt,
    resolvedAt: status === "resolved" ? now : message.maintenance.resolvedAt,
  };

  const { error } = await db.from("messages").update({ maintenance }).eq("id", messageId);
  if (error) throw error;

  return { ...message, maintenance };
}

/** Re-parents a listing's pre-lease inquiry thread onto the real lease once one exists, so the conversation carries over instead of resetting. */
export async function migrateListingThreadToLease(listingId: string, leaseId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("messages")
    .update({ lease_id: leaseId })
    .eq("listing_id", listingId)
    .is("lease_id", null);
  if (error) throw error;
}
