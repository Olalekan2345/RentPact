import type { Address } from "viem";
import { tenancyCredentialAbi } from "@/lib/contracts/tenancyCredentialAbi";
import { publicClient, tenancyCredentialAddress } from "@/lib/contracts/rentPactEscrow";

export interface TenancyCredentialSummary {
  tokenId: bigint;
  leaseId: bigint;
  durationDays: number;
  totalPeriods: number;
  onTimePeriods: number;
  disputesLost: number;
  completionDate: number;
}

// keccak256("Transfer(address,address,uint256)") — the standard ERC-721
// Transfer topic. Mints are Transfer(0x0, owner, tokenId).
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO_TOPIC = "0x" + "0".repeat(64);
const SCAN_BASE = "https://testnet.arcscan.app";

/**
 * Finds the tokenIds minted to `owner` by reading the credential contract's
 * Transfer logs from the Arcscan (Blockscout) indexer rather than the Arc RPC.
 * The RPC caps eth_getLogs at 10k blocks and serves ~one request at a time, so
 * a full-history scan (deployBlock to tip is 400k+ blocks) routinely timed out
 * — and the old code then silently reported "no credentials". The indexer
 * returns the whole set in one call.
 */
async function scanMintedTokenIds(address: Address, owner: Address): Promise<bigint[]> {
  const ownerTopic = "0x" + owner.slice(2).toLowerCase().padStart(64, "0");
  const tokenIds: bigint[] = [];

  let params: Record<string, string> | undefined = undefined;
  for (let page = 0; page < 50; page++) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(`${SCAN_BASE}/api/v2/addresses/${address}/logs${qs}`);
    if (!res.ok) throw new Error(`Arcscan ${res.status}`);
    const body: { items?: { topics?: (string | null)[] }[]; next_page_params?: Record<string, string> | null } =
      await res.json();

    for (const log of body.items ?? []) {
      const t = log.topics ?? [];
      const t0 = (t[0] ?? "").toLowerCase();
      const from = (t[1] ?? "").toLowerCase();
      const to = (t[2] ?? "").toLowerCase();
      const tokenId = t[3];
      if (t0 !== TRANSFER_TOPIC || from !== ZERO_TOPIC || to !== ownerTopic || !tokenId) continue;
      tokenIds.push(BigInt(tokenId));
    }

    if (!body.next_page_params) break;
    params = body.next_page_params;
  }

  return tokenIds;
}

/**
 * Every soulbound TenancyCredential minted to `owner`, newest first. Token ids
 * come from the indexer (above); the per-token detail is read straight from the
 * contract via the rate-limit-aware transport.
 */
export async function getCredentialsForOwner(owner: Address): Promise<TenancyCredentialSummary[]> {
  if (!tenancyCredentialAddress) return [];

  try {
    const tokenIds = await scanMintedTokenIds(tenancyCredentialAddress, owner);

    const credentials = await Promise.all(
      tokenIds.map(async (tokenId) => {
        const data = await publicClient.readContract({
          address: tenancyCredentialAddress!,
          abi: tenancyCredentialAbi,
          functionName: "credentialData",
          args: [tokenId],
        });
        return {
          tokenId,
          leaseId: data.leaseId,
          durationDays: Number(data.durationDays),
          totalPeriods: Number(data.totalPeriods),
          onTimePeriods: Number(data.onTimePeriods),
          disputesLost: Number(data.disputesLost),
          completionDate: Number(data.completionDate) * 1000,
        };
      }),
    );

    return credentials.sort((a, b) => b.completionDate - a.completionDate);
  } catch (err) {
    // Never leave the credentials panel loading forever — degrade to "none
    // found" and let the next visit retry.
    console.error("Could not load tenancy credentials:", err);
    return [];
  }
}
