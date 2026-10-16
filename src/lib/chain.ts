import { defineChain } from "viem";
import { envResult } from "@/lib/env";

const chainId = envResult.success ? envResult.env.NEXT_PUBLIC_ARC_CHAIN_ID : 5042002;
const explorerUrl = envResult.success
  ? envResult.env.NEXT_PUBLIC_ARC_EXPLORER_URL
  : "https://testnet.arcscan.app";

/**
 * Official Arc Testnet RPC endpoints (docs.arc.io → RPC endpoints), in preference order: Circle's
 * primary first, then the infrastructure partners as fallbacks. Arc moved from arc.network to arc.io in
 * Oct 2026 and the old hostname (rpc.testnet.arc.network) stopped resolving, which took every on-chain
 * read down at once — so reads now fall through this list instead of depending on one host.
 */
const OFFICIAL_RPCS = [
  "https://rpc.testnet.arc.io",
  "https://rpc.drpc.testnet.arc.io",
  "https://rpc.blockdaemon.testnet.arc.io",
  "https://rpc.quicknode.testnet.arc.io",
];

// A configured URL on the retired arc.network domain is ignored, so a stale value left in a deploy
// environment can't take the app down again.
const isRetired = (url: string) => {
  try {
    return new URL(url).hostname.endsWith("arc.network");
  } catch {
    return true;
  }
};
const configured = envResult.success ? envResult.env.NEXT_PUBLIC_ARC_RPC_URL : null;

/** RPC URLs to try in order: a (non-retired) configured URL first, then the official list. */
export const arcRpcUrls: string[] = [...new Set([...(configured && !isRetired(configured) ? [configured] : []), ...OFFICIAL_RPCS])];

export const arcTestnet = defineChain({
  id: chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: arcRpcUrls },
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
