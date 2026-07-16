"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PropertyImage } from "@/components/PropertyImage";
import { EmptyState } from "@/components/EmptyState";
import { Badge, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { getLease, type Lease } from "@/lib/leaseData";
import { fetchListing, type Listing } from "@/lib/listings";
import { fetchThreadsForEmail, type Thread } from "@/lib/messages";

interface ThreadRow extends Thread {
  lease: Lease | null;
  listing: Listing | null;
}

export default function MessagesPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<ThreadRow[] | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    fetchThreadsForEmail(session.email).then(async (threads) => {
      const withDetails = await Promise.all(
        threads.map(async (t) => ({
          ...t,
          lease: t.leaseId ? await getLease(t.leaseId, false) : null,
          listing: t.listingId ? await fetchListing(t.listingId) : null,
        })),
      );
      setRows(withDetails);
    });
  }, [session]);

  if (isLoading || !session) return null;

  return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl text-ink">Messages</h1>
        <p className="mt-1 text-ink-muted">Conversations about listings and leases, all kept on-platform.</p>

        <div className="mt-8">
          {rows === null ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              title="No conversations yet"
              body="Message a landlord from a listing, or a thread opens automatically once you have a lease."
            />
          ) : (
            <div className="flex flex-col divide-y divide-forest-100 rounded-lg border border-forest-100/60 bg-cream-100">
              {rows.map((row) => {
                const property = row.lease ?? row.listing;
                const counterparty =
                  row.lastMessage.fromEmail === session.email ? row.lastMessage.toEmail : row.lastMessage.fromEmail;
                const href =
                  row.kind === "lease"
                    ? `/messages/${row.leaseId}`
                    : `/messages/listing/${row.listingId}?with=${encodeURIComponent(counterparty)}`;

                return (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-cream-200"
                  >
                    {property && (
                      <PropertyImage
                        seed={property.id}
                        propertyType={property.propertyType}
                        overrideUrl={property.photoUrl}
                        alt={property.propertyAddress}
                        className="h-12 w-12 shrink-0 rounded-md"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-ink">{property?.propertyAddress ?? "Conversation"}</p>
                        <span className="shrink-0 text-xs text-ink-soft">{formatDate(new Date(row.lastMessage.createdAt))}</span>
                      </div>
                      <p className="truncate text-sm text-ink-soft">
                        {counterparty}
                        {row.kind === "listing" && " · Inquiry"}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-ink-muted">{row.lastMessage.text}</p>
                    </div>
                    {row.unreadCount > 0 && <Badge variant="forest">{row.unreadCount}</Badge>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );
}
