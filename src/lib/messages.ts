"use client";

import type { ConditionAreaKey } from "@/lib/condition";

export type MessageType = "text" | "maintenance" | "system" | "payment-reminder";
export type MaintenanceCategory = "plumbing" | "electrical" | "structural" | "security" | "pest" | "other";
export type IssueSeverity = "cosmetic" | "affects-daily-living" | "urgent-safety";
export type MaintenanceStatus = "reported" | "acknowledged" | "in-progress" | "resolved";

export interface MaintenanceDetails {
  category: MaintenanceCategory;
  area: ConditionAreaKey | null;
  description: string;
  photos: string[];
  videoUrl: string | null;
  severity: IssueSeverity;
  status: MaintenanceStatus;
  acknowledgedAt: number | null;
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
  counterpartyEmail: string | null;
  lastMessage: Message;
  unreadCount: number;
}

export async function fetchThread(leaseId: string): Promise<Message[]> {
  const res = await fetch(`/api/messages?leaseId=${encodeURIComponent(leaseId)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.messages ?? [];
}

export async function fetchListingThread(listingId: string, viewerEmail: string, withEmail: string): Promise<Message[]> {
  const params = new URLSearchParams({ listingId, viewerEmail, withEmail });
  const res = await fetch(`/api/messages?${params.toString()}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.messages ?? [];
}

export async function fetchThreadsForEmail(email: string): Promise<Thread[]> {
  const res = await fetch(`/api/messages?forEmail=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.threads ?? [];
}

async function postMessage(body: Record<string, unknown>): Promise<Message> {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? "Could not send message.");
  }
  const json = await res.json();
  return json.message;
}

export async function sendTextMessage(input: {
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  text: string;
}): Promise<Message> {
  return postMessage({ ...input, type: "text" });
}

/** A prospective tenant messaging a landlord about a listing before any deposit or lease exists. */
export async function sendListingInquiry(input: {
  listingId: string;
  fromEmail: string;
  toEmail: string;
  text: string;
}): Promise<Message> {
  return postMessage({ ...input, type: "text" });
}

export async function sendMaintenanceRequest(input: {
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  category: MaintenanceCategory;
  area: ConditionAreaKey | null;
  description: string;
  photos: string[];
  videoUrl: string | null;
  severity: IssueSeverity;
}): Promise<Message> {
  return postMessage({
    leaseId: input.leaseId,
    fromEmail: input.fromEmail,
    toEmail: input.toEmail,
    type: "maintenance",
    text: input.description,
    maintenance: {
      category: input.category,
      area: input.area,
      description: input.description,
      photos: input.photos,
      videoUrl: input.videoUrl,
      severity: input.severity,
      status: "reported",
      acknowledgedAt: null,
      resolvedAt: null,
    },
  });
}

export const PAYMENT_REMINDER_TEMPLATES = [
  "Friendly reminder — a period on this lease is ready to release whenever you get a chance.",
  "Just checking in — the next tranche release is due. No rush, just a nudge!",
  "Heads up: escrow has periods pending release on this lease.",
] as const;

export async function sendPaymentReminder(input: {
  leaseId: string;
  fromEmail: string;
  toEmail: string;
  template: string;
}): Promise<Message> {
  return postMessage({ leaseId: input.leaseId, fromEmail: input.fromEmail, toEmail: input.toEmail, type: "payment-reminder", text: input.template });
}

/** Fire-and-forget — a failed system-message post should never block the underlying lease action. */
export function postSystemMessage(input: { leaseId: string; fromEmail: string; toEmail: string; text: string }): void {
  postMessage({ ...input, type: "system" }).catch((err) => {
    console.error("Could not post system message:", err);
  });
}

export async function markThreadRead(
  target: { leaseId?: string; listingId?: string; counterpartyEmail?: string },
  readerEmail: string,
): Promise<void> {
  await fetch("/api/messages/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, readerEmail }),
  });
}

export async function updateMaintenanceStatus(
  messageId: string,
  status: MaintenanceStatus,
  requesterEmail: string,
): Promise<Message> {
  const res = await fetch(`/api/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, requesterEmail }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error ?? "Could not update maintenance status.");
  }
  const json = await res.json();
  return json.message;
}

/** Re-parents a listing's pre-lease inquiry onto the real lease once one exists, so the conversation carries over. */
export async function migrateListingThreadToLease(listingId: string, leaseId: string): Promise<void> {
  await fetch("/api/messages/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listingId, leaseId }),
  });
}
