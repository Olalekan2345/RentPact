import { defineChain } from "viem";
import { envResult } from "@/lib/env";

const chainId = envResult.success ? envResult.env.NEXT_PUBLIC_ARC_CHAIN_ID : 5042002;
const rpcUrl = envResult.success ? envResult.env.NEXT_PUBLIC_ARC_RPC_URL : "https://rpc.testnet.arc.network";
const explorerUrl = envResult.success
  ? envResult.env.NEXT_PUBLIC_ARC_EXPLORER_URL
  : "https://testnet.arcscan.app";

export const arcTestnet = defineChain({
  id: chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: explorerUrl },
  },
  testnet: true,
});

export function explorerTxUrl(hash: string): string {
  return `${explorerUrl.replace(/\/$/, "")}/tx/${hash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${explorerUrl.replace(/\/$/, "")}/address/${address}`;
}

/** Blockscout's NFT-instance URL convention — Arcscan's /address and /tx paths already match Blockscout's shape. */
export function explorerTokenUrl(contractAddress: string, tokenId: bigint | number): string {
  return `${explorerUrl.replace(/\/$/, "")}/token/${contractAddress}/instance/${tokenId}`;
}
