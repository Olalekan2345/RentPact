import { keccak256, toHex } from "viem";

/**
 * Stable Circle userId derived from email — Circle userIds must avoid "@"/".".
 * Shared by the browser (wallet provisioning in circle.ts) and the server
 * (resolving which wallet a signed-in email actually controls), so both sides
 * always agree on the same Circle user.
 */
export function circleUserIdFromEmail(email: string): string {
  return `rp_${keccak256(toHex(email.trim().toLowerCase())).slice(2, 34)}`;
}
