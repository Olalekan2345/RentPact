"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Button, Card, CardContent, CountUp, Skeleton } from "@/components/ui";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { getGatewayBalances } from "@/lib/circle";

export default function SecuritySettingsPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLoading && !session) router.push("/auth");
  }, [isLoading, session, router]);

  const refreshBalance = useCallback(async () => {
    if (!session) return;
    const balances = await getGatewayBalances(session.address);
    const arc = balances.find((b) => b.chain === "arc-testnet");
    setBalance(arc?.balance ?? 0);
  }, [session]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  if (isLoading || !session) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(session.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Linked wallet</p>
          <div className="mt-2 flex items-center gap-2 rounded-md border border-forest-100 bg-cream-50 px-3 py-2.5">
            <p className="flex-1 truncate font-mono text-sm text-ink">{session.address}</p>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Created silently through Circle when you signed up — no seed phrase to manage.
          </p>

          <div className="mt-4 border-t border-forest-100 pt-4">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Balance</p>
            {balance === null ? (
              <Skeleton className="mt-2 h-8 w-32" />
            ) : (
              <p className="mt-1 flex items-center gap-1 text-xl font-semibold text-ink">
                <UsdcIcon className="h-4 w-4 shrink-0" />
                <CountUp value={balance} /> <span className="text-sm font-normal text-ink-soft">USDC</span>
              </p>
            )}
          </div>

          <Link href="/wallet" className="mt-4 block">
            <Button variant="secondary" size="sm">
              Go to wallet →
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div>
            <p className="text-sm font-medium text-ink-muted">How your wallet is secured</p>
            <p className="mt-1 text-xs text-ink-soft">
              Every transaction — deposit, signature, release, dispute — requires you to approve it through
              Circle&apos;s hosted signing panel with the PIN you set. There&apos;s no separate app password and
              no seed phrase that can be lost or phished.
            </p>
          </div>
          <div className="border-t border-forest-100 pt-3">
            <p className="text-sm font-medium text-ink-muted">Two-factor authentication</p>
            <p className="mt-1 text-xs text-ink-soft">
              Not available yet as a separate toggle — your PIN already acts as the second factor on every
              signed transaction.
            </p>
          </div>
          <div className="border-t border-forest-100 pt-3">
            <p className="text-sm font-medium text-ink-muted">Active sessions</p>
            <p className="mt-1 text-xs text-ink-soft">
              Device/session management isn&apos;t built yet — this app doesn&apos;t currently track logins across
              devices.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
