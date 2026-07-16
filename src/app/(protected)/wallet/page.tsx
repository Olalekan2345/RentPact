"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Address } from "viem";
import { useAuth } from "@/lib/auth-context";
import { Badge, Button, Card, CardContent, CountUp, Skeleton } from "@/components/ui";
import { CurrencyEquivalent } from "@/components/CurrencyEquivalent";
import { UpcomingPaymentsCalendar } from "@/components/UpcomingPaymentsCalendar";
import { UsdcAmount } from "@/components/UsdcAmount";
import { UsdcIcon } from "@/components/icons/UsdcIcon";
import { RefreshIcon } from "@/components/icons/NavIcons";
import { getGatewayBalances, transferOut } from "@/lib/circle";
import { listLeasesForTenant, listLeasesForLandlord, type Lease } from "@/lib/leaseData";
import { useCautionFeeLabel } from "@/lib/cautionFee";
import { CAUTION_CLAIM_WINDOW_MS, DAY_MS } from "@/lib/constitution";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export default function WalletOverviewPage() {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  const [balance, setBalance] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [leases, setLeases] = useState<Lease[] | null>(null);

  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const cautionLabel = useCautionFeeLabel();

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

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await refreshBalance();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!session) return;
    Promise.all([listLeasesForTenant(session, false), listLeasesForLandlord(session, false)]).then(([tenant, landlord]) => {
      setLeases([...tenant, ...landlord]);
    });
  }, [session]);

  if (isLoading || !session) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(session.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTransfer = async (e: FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    setTxHash(null);

    if (!ADDRESS_REGEX.test(recipient)) {
      setTransferError("Enter a valid recipient address (0x… 40 hex characters).");
      return;
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      setTransferError("Enter an amount greater than zero.");
      return;
    }
    if (balance !== null && amountNum > balance) {
      setTransferError("You don't have that much USDC.");
      return;
    }

    setSending(true);
    try {
      const { hash } = await transferOut({ address: session.address, to: recipient as Address, amount: amountNum });
      setTxHash(hash);
      setRecipient("");
      setAmount("");
      await refreshBalance();
      // Best-effort — a failure here shouldn't undo a transfer that already succeeded on-chain.
      fetch("/api/wallet-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.email, toAddress: recipient, amount: amountNum, txHash: hash }),
      }).catch(() => {});
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : "Transfer failed. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="pt-6">
          <p className="text-xs uppercase tracking-wide text-ink-soft">Your wallet address</p>
          <div className="mt-2 flex items-center gap-2 rounded-md border border-forest-100 bg-cream-50 px-3 py-2.5">
            <p className="flex-1 truncate font-mono text-sm text-ink">{session.address}</p>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Created silently through Circle when you signed up — no seed phrase to manage.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-1.5">
            <p className="text-xs uppercase tracking-wide text-ink-soft">Balance</p>
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={balance === null || refreshing}
              aria-label="Refresh balance"
              title="Refresh balance"
              className="rounded-full p-1 text-ink-soft transition-colors hover:bg-forest-50 hover:text-forest-500 disabled:opacity-50"
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
          {balance === null ? (
            <Skeleton className="mt-2 h-9 w-40" />
          ) : (
            <>
              <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold text-ink">
                <UsdcIcon className="h-5 w-5 shrink-0" />
                <CountUp value={balance} /> <span className="text-base font-normal text-ink-soft">USDC</span>
              </p>
              <CurrencyEquivalent usdcAmount={balance} className="mt-1 block text-xs text-ink-soft" />
            </>
          )}
          <Link href="/listings" className="mt-4 block">
            <Button variant="secondary" size="sm">
              Rent a place to deposit →
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-semibold text-ink">Upcoming payments</p>
          <p className="mt-1 text-sm text-ink-muted">Scheduled releases across all your leases.</p>
          <div className="mt-4">
            {leases === null ? <Skeleton className="h-64 w-full" /> : <UpcomingPaymentsCalendar leases={leases} />}
          </div>
        </CardContent>
      </Card>

      {leases !== null && leases.some((l) => l.cautionAmount > 0) && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm font-semibold text-ink">{cautionLabel.term}s</p>
            <p className="mt-1 text-sm text-ink-muted">
              Held in escrow separate from rent, never mixed into rent line items.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {leases
                .filter((l) => l.cautionAmount > 0)
                .map((l) => {
                  const status = cautionStatus(l);
                  return (
                    <Link
                      key={l.id}
                      href={`/leases/${l.id}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-forest-100 p-3 text-sm hover:border-forest-200"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{l.propertyAddress}</p>
                        <p className="flex items-center gap-1 text-xs text-ink-soft">
                          <UsdcAmount amount={l.cautionAmount} iconSize={11} />
                        </p>
                      </div>
                      <Badge variant={status.variant} className="shrink-0">
                        {status.label}
                      </Badge>
                    </Link>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm font-semibold text-ink">Transfer out</p>
          <p className="mt-1 text-sm text-ink-muted">
            Send USDC from your RentPact wallet to any address — gasless, same as every other
            action in the app.
          </p>

          <form onSubmit={handleTransfer} className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-muted">Recipient address</label>
              <input
                type="text"
                placeholder="0x…"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                className="h-12 rounded-md border border-forest-100 bg-cream-50 px-4 font-mono text-sm text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-ink-muted">Amount (USDC)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-12 rounded-md border border-forest-100 bg-cream-50 px-4 text-[15px] text-ink focus:border-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-100"
              />
            </div>

            {transferError && <p className="text-sm text-terracotta-500">{transferError}</p>}
            {txHash && (
              <p className="max-w-full truncate font-mono text-xs text-ink-soft" title={txHash}>
                Sent — {txHash.slice(0, 10)}…{txHash.slice(-8)}
              </p>
            )}

            <Button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Transfer out"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function cautionStatus(lease: Lease): { label: string; variant: "neutral" | "forest" | "gold" | "terracotta" } {
  if (lease.cautionSettled) return { label: "Returned ✓", variant: "gold" };
  if (lease.cautionClaimFiledAt !== null) return { label: "Partially returned · claim in dispute", variant: "terracotta" };
  if (lease.completedAt !== null) {
    const daysLeft = Math.max(0, Math.ceil((lease.completedAt + CAUTION_CLAIM_WINDOW_MS - Date.now()) / DAY_MS));
    return { label: `Returns in ${daysLeft}d`, variant: "forest" };
  }
  return { label: "Held in escrow", variant: "neutral" };
}
