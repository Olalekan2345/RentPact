import { createPublicClient, http, type Address } from "viem";
import { arcTestnet } from "@/lib/chain";
import { rentPactEscrowAbi, erc20Abi } from "@/lib/contracts/rentPactEscrowAbi";
import { envResult } from "@/lib/env";

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
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
