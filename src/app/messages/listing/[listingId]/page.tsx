"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { AppShell } from "@/components/AppShell";
import { PropertyImage } from "@/components/PropertyImage";
import { Button, Skeleton } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { fetchListing, type Listing } from "@/lib/listings";
import { fetchListingThread, sendListingInquiry, markThreadRead, type Message } from "@/lib/messages";

export default function ListingInquiryPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const searchParams = useSearchParams();
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    fetchListing(listingId).then(setListing);
  }, [listingId]);

  const counterpartyEmail =
    session && listing
      ? session.email === listing.landlordEmail
        ? searchParams.get("with")
        : listing.landlordEmail
      : null;

  const refresh = useCallback(async () => {
    if (!session || !counterpartyEmail) return;
    const msgs = await fetchListingThread(listingId, session.email, counterpartyEmail);
    setMessages(msgs);
  }, [session, listingId, counterpartyEmail]);

  useEffect(() => {
    if (!session || !counterpartyEmail) return;
    refresh().then(() => markThreadRead({ listingId, counterpartyEmail }, session.email).then(refresh));
  }, [session, listingId, counterpartyEmail, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (isLoading || !session || listing === undefined) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
          <Skeleton className="h-96 w-full" />
        </div>
      </AppShell>
    );
  }

  if (listing === null) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">Listing not found.</div>
      </AppShell>
    );
  }

  if (!counterpartyEmail) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-16 text-center text-ink-muted">
          Open this conversation from your{" "}
          <Link href="/messages" className="text-forest-500 underline">
            messages inbox
          </Link>{" "}
          to pick which inquiry you&apos;re replying to.
        </div>
      </AppShell>
    );
  }

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendListingInquiry({ listingId, fromEmail: session.email, toEmail: counterpartyEmail, text: text.trim() });
      setText("");
      await refresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex h-[calc(100vh-2rem)] max-w-2xl flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center gap-3 border-b border-forest-100 pb-4">
          <PropertyImage
            seed={listing.id}
            propertyType={listing.propertyType}
            overrideUrl={listing.photoUrl}
            alt={listing.propertyAddress}
            className="h-11 w-11 shrink-0 rounded-md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{listing.propertyAddress}</p>
            <p className="truncate text-sm text-ink-soft">{counterpartyEmail} · Inquiry, no lease yet</p>
          </div>
          <Link href={`/listings/${listing.id}`} className="shrink-0 text-sm font-medium text-forest-500 underline">
            View listing
          </Link>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {messages === null ? (
            <Skeleton className="h-64 w-full" />
          ) : messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-soft">
              No messages yet — ask the landlord anything before you deposit.
            </p>
          ) : (
            <div className="flex flex-col gap-3 pb-4">
              {messages.map((m) => {
                const isOwn = m.fromEmail === session.email;
                return (
                  <div key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${isOwn ? "items-end self-end" : "items-start self-start"}`}>
                    <div className={`w-fit rounded-lg px-3 py-2 text-sm ${isOwn ? "bg-forest-500 text-cream-50" : "bg-cream-200 text-ink"}`}>
                      {m.text}
                    </div>
                    <span className="px-1 text-[11px] text-ink-soft">
                      {formatDate(new Date(m.createdAt), "long")}
                      {isOwn && <> · {m.readAt ? `Read ${formatDate(new Date(m.readAt), "long")}` : "Sent"}</>}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {listing.landlordEmail !== session.email && listing.active && (
          <Link href={`/listings/${listing.id}`} className="mb-3">
            <Button variant="secondary" size="sm" className="w-full">
              Ready to move forward? Deposit &amp; rent this property →
            </Button>
          </Link>
        )}

        <form onSubmit={handleSend} className="flex gap-2 border-t border-forest-100 pt-3">
          <input
            type="text"
            placeholder="Ask about the property…"
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
