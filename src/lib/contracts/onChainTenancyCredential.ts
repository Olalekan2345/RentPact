import type { Address } from "viem";
import { tenancyCredentialAbi } from "@/lib/contracts/tenancyCredentialAbi";
import { publicClient, tenancyCredentialAddress } from "@/lib/contracts/rentPactEscrow";
import { envResult } from "@/lib/env";

const deployBlock =
  envResult.success && envResult.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK !== undefined
    ? BigInt(envResult.env.NEXT_PUBLIC_RENTPACT_DEPLOY_BLOCK)
    : 0n;

// Same 10,000-block eth_getLogs cap as onChainLease.ts.
const LOG_QUERY_CHUNK_BLOCKS = 9_000n;

export interface TenancyCredentialSummary {
  tokenId: bigint;
  leaseId: bigint;
  durationDays: number;
  totalPeriods: number;
  onTimePeriods: number;
  disputesLost: number;
  completionDate: number;
}

/**
 * Scans Transfer(0x0, owner, tokenId) mint events rather than using
 * ERC721Enumerable — same "scan real events, never store a separate index"
 * principle as every other reputation/activity feature in this app, and
 * cheaper to deploy since TenancyCredential doesn't need the Enumerable
 * extension at all.
 */
export async function getCredentialsForOwner(owner: Address): Promise<TenancyCredentialSummary[]> {
  if (!tenancyCredentialAddress) return [];

  const latestBlock = await publicClient.getBlockNumber();
  const tokenIds: bigint[] = [];

  for (let fromBlock = deployBlock; fromBlock <= latestBlock; fromBlock += LOG_QUERY_CHUNK_BLOCKS) {
    const toBlock =
      fromBlock + LOG_QUERY_CHUNK_BLOCKS - 1n > latestBlock ? latestBlock : fromBlock + LOG_QUERY_CHUNK_BLOCKS - 1n;

    const logs = await publicClient.getContractEvents({
      address: tenancyCredentialAddress,
      abi: tenancyCredentialAbi,
      eventName: "Transfer",
      args: { from: "0x0000000000000000000000000000000000000000" as Address, to: owner },
      fromBlock,
      toBlock,
    });
    for (const log of logs) {
      if (log.args.tokenId !== undefined) tokenIds.push(log.args.tokenId);
    }
  }

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
}
