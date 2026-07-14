import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ensureProfile } from "@/lib/profileServer";

/**
 * Direct wallet-to-wallet USDC transfers ("Transfer out" on the Wallet
 * Overview tab) — the one kind of money movement the lease activity feed
 * doesn't know about, since it's not tied to any lease's escrow.
 */
export interface WalletTransfer {
  id: string;
  email: string;
  toAddress: string;
  amount: number;
  txHash: string;
  createdAt: number;
}

function fromRow(row: {
  id: string;
  email: string;
  to_address: string;
  amount: number;
  tx_hash: string;
  created_at: number;
}): WalletTransfer {
  return {
    id: row.id,
    email: row.email,
    toAddress: row.to_address,
    amount: row.amount,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

export async function recordWalletTransfer(
  input: Omit<WalletTransfer, "id" | "createdAt">,
): Promise<WalletTransfer> {
  const normalized = input.email.trim().toLowerCase();
  await ensureProfile(normalized);

  const transfer: WalletTransfer = { ...input, email: normalized, id: crypto.randomUUID(), createdAt: Date.now() };

  const { error } = await supabaseAdmin().from("wallet_transfers").insert({
    id: transfer.id,
    email: transfer.email,
    to_address: transfer.toAddress,
    amount: transfer.amount,
    tx_hash: transfer.txHash,
    created_at: transfer.createdAt,
  });
  if (error) throw error;

  return transfer;
}

export async function listWalletTransfersForEmail(email: string): Promise<WalletTransfer[]> {
  const normalized = email.trim().toLowerCase();
  const { data } = await supabaseAdmin()
    .from("wallet_transfers")
    .select()
    .eq("email", normalized)
    .order("created_at", { ascending: false });
  return (data ?? []).map(fromRow);
}
