"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Skeleton } from "@/components/ui";
import { getTenancyCredentials, type TenancyCredentialSummary } from "@/lib/leaseData";
import { TenancyCredentialCard } from "@/components/TenancyCredentialCard";

export default function CredentialsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [credentials, setCredentials] = useState<TenancyCredentialSummary[] | null>(null);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session) return;
    getTenancyCredentials(session.address).then(setCredentials);
  }, [session]);

  if (isLoading || !session) return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <Link href="/profile" className="text-sm text-forest-500 underline">
        ← Back to profile
      </Link>
      <h1 className="mt-4 text-3xl text-ink">Tenancy credentials</h1>
      <p className="mt-2 max-w-xl text-sm text-ink-muted">
        Soulbound proof of tenancy, minted only on a full, clean lease completion — never earned from a
        cancelled or early-terminated lease. Each one is verifiable on-chain.
      </p>

      {credentials === null ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : credentials.length === 0 ? (
        <div className="mt-8 rounded-lg border border-forest-100 bg-cream-100 p-8 text-center">
          <p className="text-sm text-ink-muted">Complete your first lease to earn your tenancy credential.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          {credentials.map((c) => (
            <TenancyCredentialCard key={c.tokenId.toString()} credential={c} />
          ))}
        </div>
      )}
    </div>
  );
}
