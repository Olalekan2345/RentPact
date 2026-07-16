"use client";

/**
 * Unified notification feed for the bell. Nothing here is stored —
 * notifications are derived live from real events every time they're
 * fetched: the on-chain/mock activity feed (deposits, signatures, releases,
 * disputes), message threads (new messages, maintenance updates), and
 * reviews. Only read-state is persisted (lib/notificationReadServer.ts),
 * since the underlying events have no user-specific read flag of their own.
 *
 * Deliberately NOT included, because there's no real feature behind them
 * yet in this app: lease renewals, dispute evidence/settlement/arbitration,
 * account/device/login security events, ID verification, profile-view
 * tracking, and network/system announcements. Adding notifications for
 * those would mean fabricating data this project has avoided everywhere
 * else. Signature deadlines and upcoming-release reminders are live
 * conditions rather than discrete events, so they stay on the dashboard's
 * alert strip (already built) instead of duplicating into this event log.
 */

import { getActivityFeed, type ActivityItem } from "@/lib/leaseData";
import { getLeaseMetadata } from "@/lib/leaseMetadataStore";
import { fetchThreadsForEmail, type Thread } from "@/lib/messages";
import { fetchReviewsFor, type Review } from "@/lib/reviews";
import { formatUSDC } from "@/lib/format";

export type NotificationCategory = "money" | "lease" | "maintenance" | "dispute" | "messages";

export interface Notification {
  id: string;
  category: NotificationCategory;
  title: string;
  timestamp: number;
  read: boolean;
  href: string;
  urgent: boolean;
}

async function activityToNotifications(session: { email: string; address: `0x${string}` }): Promise<Notification[]> {
  const items = await getActivityFeed(session, 30);
  if (items.length === 0) return [];

  // Property labels only need Postgres metadata, not a full on-chain lease
  // fetch (which would also pay for dispute/caution-claim event scans this
  // feed never renders) — see onChainLeaseToLease's docstring in leaseData.ts.
  const leaseIds = [...new Set(items.map((i) => i.leaseId))];
  const properties = new Map<string, string | null>(
    await Promise.all(leaseIds.map(async (id) => [id, (await getLeaseMetadata(id))?.propertyAddress ?? null] as const)),
  );

  const propertyLabel = (leaseId: string) => properties.get(leaseId) ?? `lease #${leaseId}`;

  return items.map((item) => {
    const { category, title, urgent } = describeActivity(item, propertyLabel(item.leaseId));
    return {
      id: `activity:${item.id}`,
      category,
      title,
      timestamp: item.timestamp,
      read: false,
      href: `/leases/${item.leaseId}`,
      urgent,
    };
  });
}

function describeActivity(
  item: ActivityItem,
  property: string,
): { category: NotificationCategory; title: string; urgent: boolean } {
  switch (item.type) {
    case "deposit":
      return { category: "money", title: `Escrow deposit of ${formatUSDC(item.amount ?? 0)} USDC confirmed for ${property}`, urgent: true };
    case "signed":
      return { category: "lease", title: `Lease signed — ${property} is now active`, urgent: false };
    case "release":
      return { category: "money", title: `${formatUSDC(item.amount ?? 0)} USDC released for ${property}`, urgent: true };
    case "dispute-raised":
      return { category: "dispute", title: `Dispute raised on ${property}`, urgent: true };
    case "dispute-resolved": {
      const refunded = item.amount ?? 0;
      const text = refunded > 0 ? `Dispute resolved — ${formatUSDC(refunded)} USDC refunded to the tenant` : `Dispute resolved — funds released to the landlord`;
      return { category: "dispute", title: `${text} (${property})`, urgent: true };
    }
    case "cancelled":
      return { category: "money", title: `Lease cancelled — ${formatUSDC(item.amount ?? 0)} USDC refunded (${property})`, urgent: true };
    case "caution-claim-filed":
      return {
        category: "dispute",
        title: `Landlord filed a caution fee claim of ${formatUSDC(item.amount ?? 0)} USDC on ${property} — the undisputed remainder released to the tenant immediately`,
        urgent: true,
      };
    case "caution-released":
      return { category: "money", title: `Caution fee returned — ${formatUSDC(item.amount ?? 0)} USDC ✓ (${property})`, urgent: true };
    case "caution-claim-resolved":
      return { category: "dispute", title: `Caution fee claim resolved on ${property}`, urgent: true };
  }
}

function threadsToNotifications(threads: Thread[], viewerEmail: string): Notification[] {
  const notifications: Notification[] = [];
  for (const t of threads) {
    const m = t.lastMessage;
    if (m.toEmail !== viewerEmail) continue; // nothing new addressed to me
    if (m.type === "system") continue; // already covered via the activity feed

    const href =
      t.kind === "lease"
        ? `/messages/${t.leaseId}`
        : `/messages/listing/${t.listingId}?with=${encodeURIComponent(t.counterpartyEmail ?? m.fromEmail)}`;

    if (m.type === "maintenance") {
      notifications.push({
        id: `message:${m.id}`,
        category: "maintenance",
        title: `${m.fromEmail} reported a maintenance issue: ${m.text}`,
        timestamp: m.createdAt,
        read: m.readAt !== null,
        href,
        urgent: false,
      });
      continue;
    }

    notifications.push({
      id: `message:${m.id}`,
      category: "messages",
      title: m.type === "payment-reminder" ? `${m.fromEmail} sent a payment reminder` : `${m.fromEmail} sent a message`,
      timestamp: m.createdAt,
      read: m.readAt !== null,
      href,
      urgent: false,
    });
  }
  return notifications;
}

function reviewsToNotifications(reviews: Review[]): Notification[] {
  return reviews.map((r) => ({
    id: `review:${r.id}`,
    category: "messages",
    title: `${r.fromEmail} left you a ${r.rating}-star review`,
    timestamp: r.createdAt,
    read: false,
    href: "/profile",
    urgent: false,
  }));
}

export async function getNotifications(session: { email: string; address: `0x${string}` }): Promise<Notification[]> {
  const [activityNotifs, threads, reviews, readIds] = await Promise.all([
    activityToNotifications(session),
    fetchThreadsForEmail(session.email),
    fetchReviewsFor(session.email),
    fetchReadIds(session.email),
  ]);

  const readSet = new Set(readIds);
  const messageNotifs = threadsToNotifications(threads, session.email);
  const reviewNotifs = reviewsToNotifications(reviews);

  const all = [...activityNotifs, ...messageNotifs, ...reviewNotifs].map((n) => ({
    ...n,
    read: n.read || readSet.has(n.id),
  }));

  return all.sort((a, b) => b.timestamp - a.timestamp);
}

export async function fetchReadIds(email: string): Promise<string[]> {
  const res = await fetch(`/api/notifications/read?email=${encodeURIComponent(email)}`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.readIds ?? [];
}

export async function markNotificationsRead(email: string, notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, notificationIds }),
  });
}

export type NotificationPrefs = Record<NotificationCategory, boolean>;

export async function fetchNotificationPrefs(email: string): Promise<NotificationPrefs | null> {
  const res = await fetch(`/api/notifications/prefs?email=${encodeURIComponent(email)}`);
  if (!res.ok) return null;
  const json = await res.json();
  return json.prefs ?? null;
}

export async function updateNotificationPrefs(
  email: string,
  updates: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const res = await fetch("/api/notifications/prefs", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...updates }),
  });
  const json = await res.json();
  return json.prefs;
}
