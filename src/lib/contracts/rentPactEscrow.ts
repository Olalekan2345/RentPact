import { createPublicClient, http, type Address, type Transport } from "viem";
import { arcTestnet } from "@/lib/chain";
import { rentPactEscrowAbi, erc20Abi } from "@/lib/contracts/rentPactEscrowAbi";
import { envResult } from "@/lib/env";

/**
 * Arc's public RPC enforces two hard limits (verified empirically):
 *  - roughly one in-flight request per client — parallel calls are rejected
 *    with -32011 "request limit reached", and viem's retries then stack
 *    seconds of backoff on top
 *  - whole JSON-RPC batches of eth_call are rejected outright, so viem's
 *    `batch` transport option must NOT be enabled here
 * This wrapper funnels every request through a single-file queue (so the app
 * can keep using Promise.all naturally), and retries with a short pause if a
 * limit error still slips through.
 */
// Arc signals its rate limit as JSON-RPC code -32011, but viem surfaces the
// "request limit reached" text inconsistently — sometimes in `.message`, often
// only in `.details`/`.cause`/`.metaMessages`. Match on all of them plus the
// code so a limited request is always retried, never thrown to the UI.
function isRateLimited(err: unknown): boolean {
  const e = err as {
    code?: number;
    message?: string;
    details?: string;
    shortMessage?: string;
    metaMessages?: string[];
    cause?: { code?: number; message?: string };
  };
  if (e?.code === -32011 || e?.cause?.code === -32011) return true;
  const blob = [e?.message, e?.details, e?.shortMessage, e?.cause?.message, ...(e?.metaMessages ?? [])]
    .filter(Boolean)
    .join(" ");
  return /request limit reached/i.test(blob);
}

function arcFriendly(base: Transport): Transport {
  let tail: Promise<void> = Promise.resolve();
  return (config) => {
    const transport = base(config);
    const originalRequest = transport.request.bind(transport);

    const request = ((params: Parameters<typeof originalRequest>[0]) => {
      const exec = async (): Promise<unknown> => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await originalRequest(params);
          } catch (err) {
            if (attempt < 8 && isRateLimited(err)) {
              await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
              continue;
            }
            throw err;
          }
        }
      };
      const result = tail.then(exec, exec);
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }) as typeof transport.request;

    return { ...transport, request };
  };
}

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: arcFriendly(http()),
});

/** Deployed RentPactEscrow address, or null until Phase 2's deploy step has been run. */
export const escrowAddress: Address | null =
  envResult.success && envResult.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS
    ? (envResult.env.NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS as Address)
    : null;

export const usdcAddress: Address | null =
  envResult.success && envResult.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
    ? (envResult.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS as Address)
    : null;

/** Deployed TenancyCredential address, or null until it's been deployed and wired. */
export const tenancyCredentialAddress: Address | null =
  envResult.success && envResult.env.NEXT_PUBLIC_TENANCY_CREDENTIAL_ADDRESS
    ? (envResult.env.NEXT_PUBLIC_TENANCY_CREDENTIAL_ADDRESS as Address)
    : null;

/**
 * The single address the deployed contract accepts arbiter rulings from
 * (immutable, set at deploy). Public on-chain anyway. Used only to gate the
 * dispute page's Tier-2 resolution controls to the arbiter — a party's
 * resolveDispute call reverts NotArbiter regardless, this just avoids showing
 * them a button that can't work.
 */
export const arbiterAddress: Address | null =
  envResult.success && envResult.env.NEXT_PUBLIC_ARC_ARBITER_ADDRESS
    ? (envResult.env.NEXT_PUBLIC_ARC_ARBITER_ADDRESS as Address)
    : null;

/** Whether the given address is the configured on-chain arbiter (case-insensitive). */
export function isArbiter(address: string | null | undefined): boolean {
  return !!address && !!arbiterAddress && address.toLowerCase() === arbiterAddress.toLowerCase();
}

export function isContractDeployed(): boolean {
  return escrowAddress !== null;
}

export async function readOnChainLease(leaseId: bigint) {
  if (!escrowAddress) throw new Error("RentPactEscrow is not deployed yet — see SETUP.md.");
  return publicClient.readContract({
    address: escrowAddress,
    abi: rentPactEscrowAbi,
    functionName: "getLease",
    args: [leaseId],
  });
}

export async function readPendingPeriods(leaseId: bigint) {
  if (!escrowAddress) throw new Error("RentPactEscrow is not deployed yet — see SETUP.md.");
  return publicClient.readContract({
    address: escrowAddress,
    abi: rentPactEscrowAbi,
    functionName: "pendingPeriods",
    args: [leaseId],
  });
}

export async function readUsdcBalance(address: Address) {
  if (!usdcAddress) throw new Error("USDC contract address is not configured.");
  return publicClient.readContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
}
