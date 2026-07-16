import type { Address } from "viem";
import type { ReleaseFrequency } from "@/components/escrow";
import { MOCK_MODE, sendGaslessTransaction } from "@/lib/circle";
import * as mockStore from "@/lib/leaseStore";
import { getLeaseMetadata, saveLeaseMetadata, findLeaseIdsForAddress } from "@/lib/leaseMetadataStore";
import { cachedChainRead } from "@/lib/chainCache";
import {
  readLease,
  readPendingPeriods as readOnChainPendingPeriods,
  readAllowance,
  extractLeaseIdFromReceipt,
  encodeApprove,
  encodeCreateLease,
  encodeSignLease,
  encodeReleaseTranche,
  encodeRaiseDispute,
  encodeResolveDispute,
  encodeProposeSettlement,
  encodeAcceptSettlement,
  encodeAutoResolveOverdueDispute,
  encodeFileDepositClaim,
  encodeReleaseCaution,
  getResolvedDisputesForLease,
  getCautionClaimHistory,
  toBaseUnits,
  BPS_DENOMINATOR,
  getReputationStats as getOnChainReputationStats,
  getActivityFeed as getOnChainActivityFeed,
  getLeaseActivity as getOnChainLeaseActivity,
  type ReputationStats,
  type ActivityItem,
} from "@/lib/contracts/onChainLease";
import { escrowAddress, usdcAddress } from "@/lib/contracts/rentPactEscrow";
import { getCredentialsForOwner, type TenancyCredentialSummary } from "@/lib/contracts/onChainTenancyCredential";
import { postSystemMessage } from "@/lib/messages";
import { fetchConstitution } from "@/lib/constitution";
import { recordLeaseConstitution } from "@/lib/leaseConstitution";
import { recordDisputeRuling } from "@/lib/disputeRuling";

/**
 * Fire-and-forget, same principle as recordConstitutionAcceptance — a failed
 * reasoning record should never block the underlying on-chain resolution.
 * Keyed to the resolvedAt timestamp of the resolution just recorded, so the
 * detail page can look it up by matching the lease's resolvedDisputes entry.
 */
function recordRuling(lease: Lease, reasoning: string): void {
  const resolvedAt = lease.resolvedDisputes.at(-1)?.resolvedAt;
  if (!resolvedAt) return;
  recordDisputeRuling({ leaseId: lease.id, resolvedAt, reasoning }).catch((err) =>
    console.error("Could not record dispute ruling:", err),
  );
}

/**
 * Fire-and-forget, same principle as postSystemMessage — a failed
 * constitution-hash record should never block the underlying deposit.
 */
function recordConstitutionAcceptance(leaseId: string): void {
  fetchConstitution()
    .then((doc) => {
      if (!doc) return;
      return recordLeaseConstitution({ leaseId, version: doc.version, hash: doc.hash, acceptedAt: Date.now() });
    })
    .catch((err) => console.error("Could not record Constitution acceptance:", err));
}

/**
 * Unified lease data layer. In MOCK_MODE this simply wraps lib/leaseStore.ts
 * (localStorage, lifecycle rules mirrored from the contract). Otherwise every
 * write is a real gasless transaction against the deployed RentPactEscrow,
 * and every read comes from the chain — property/email metadata (which the
 * contract has no concept of) is merged in from leaseMetadataStore.ts.
 *
 * All pages should import from here, never from leaseStore.ts or
 * onChainLease.ts directly, so they work identically in both modes.
 */

export type LeaseStatus = mockStore.LeaseStatus;
export type Lease = mockStore.Lease;

export function leaseStatus(lease: Lease): LeaseStatus {
  return mockStore.leaseStatus(lease);
}

export function pendingPeriods(lease: Lease): number {
  return mockStore.pendingPeriods(lease);
}

export function nextReleaseDate(lease: Lease): Date | null {
  return mockStore.nextReleaseDate(lease);
}

export function signDeadline(lease: Lease): Date {
  return mockStore.signDeadline(lease);
}

export interface CreateLeaseInput {
  tenantEmail: string;
  tenantAddress: Address;
  landlordEmail: string;
  /**
   * Real on-chain address for the landlord. Required in real mode — the
   * contract needs it at creation time and there's no way to provision it
   * on the landlord's behalf (their wallet only exists once they complete
   * their own PIN setup). In mock mode this is unused; pass tenantAddress
   * as a harmless placeholder since the mock store only tracks email.
   */
  landlordAddress: Address;
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  amountPerPeriod: number;
  totalPeriods: number;
  frequency: ReleaseFrequency;
  /** Optional caution fee (Article 1.6). 0 or omitted for none. */
  cautionAmount?: number;
}

function settlementProposerRole(onChain: {
  tenant: Address;
  landlord: Address;
  settlementProposer: Address | null;
}): "tenant" | "landlord" | null {
  if (!onChain.settlementProposer) return null;
  if (onChain.settlementProposer.toLowerCase() === onChain.tenant.toLowerCase()) return "tenant";
  if (onChain.settlementProposer.toLowerCase() === onChain.landlord.toLowerCase()) return "landlord";
  return null;
}

async function onChainLeaseToLease(leaseId: bigint): Promise<Lease> {
  const [onChain, resolvedDisputes, cautionClaim, meta] = await Promise.all([
    readLease(leaseId),
    getResolvedDisputesForLease(leaseId),
    getCautionClaimHistory(leaseId),
    getLeaseMetadata(leaseId.toString()),
  ]);

  return {
    id: leaseId.toString(),
    tenantEmail: meta?.tenantEmail ?? onChain.tenant,
    landlordEmail: meta?.landlordEmail ?? onChain.landlord,
    propertyAddress: meta?.propertyAddress ?? `Lease #${leaseId}`,
    propertyType: meta?.propertyType ?? "other",
    photoUrl: meta?.photoUrl ?? null,
    amountPerPeriod: onChain.amountPerPeriod,
    totalPeriods: onChain.totalPeriods,
    periodsReleased: onChain.periodsReleased,
    frequency: onChain.frequency,
    createdAt: onChain.createdAt,
    signedAt: onChain.signedAt,
    disputeActive: onChain.disputeActive,
    disputeRaisedAt: onChain.disputeRaisedAt,
    disputeReason: onChain.disputeReason,
    cancelled: onChain.cancelled,
    settlementProposedBps: onChain.settlementProposedBps,
    settlementProposer: settlementProposerRole(onChain),
    disputeIsCautionClaim: onChain.disputeIsCautionClaim,
    resolvedDisputes,
    cautionAmount: onChain.cautionAmount,
    completedAt: onChain.completedAt,
    cautionClaimedAmount: onChain.cautionClaimedAmount,
    cautionClaimEvidenceHash: onChain.cautionClaimEvidenceHash,
    cautionClaimFiledAt: onChain.cautionClaimFiledAt,
    cautionSettled: onChain.cautionSettled,
    cautionClaimResolvedAt: cautionClaim?.resolvedAt ?? null,
    cautionClaimLandlordBps: cautionClaim?.landlordBps ?? null,
  };
}

export async function createLease(input: CreateLeaseInput): Promise<{ lease: Lease; hash: `0x${string}` }> {
  const cautionAmount = input.cautionAmount ?? 0;

  if (!MOCK_MODE) {
    if (!escrowAddress || !usdcAddress) throw new Error("Contract or USDC address not configured.");

    const required = toBaseUnits(input.amountPerPeriod * input.totalPeriods + cautionAmount);
    const allowance = await readAllowance(input.tenantAddress);

    if (allowance < required) {
      await sendGaslessTransaction({
        from: input.tenantAddress,
        to: usdcAddress,
        data: encodeApprove(escrowAddress, required),
        description: "approve USDC for RentPactEscrow",
      });
    }

    const { hash } = await sendGaslessTransaction({
      from: input.tenantAddress,
      to: escrowAddress,
      data: encodeCreateLease(input.landlordAddress, input.amountPerPeriod, input.totalPeriods, input.frequency, cautionAmount),
      description: `createLease(${input.propertyAddress})`,
    });

    const leaseId = await extractLeaseIdFromReceipt(hash);
    if (leaseId === null) throw new Error("Could not determine the on-chain leaseId from the transaction.");

    await saveLeaseMetadata(leaseId.toString(), {
      propertyAddress: input.propertyAddress,
      propertyType: input.propertyType,
      photoUrl: input.photoUrl,
      tenantEmail: input.tenantEmail,
      landlordEmail: input.landlordEmail,
      tenantAddress: input.tenantAddress,
      landlordAddress: input.landlordAddress,
    });

    const lease = await onChainLeaseToLease(leaseId);
    postSystemMessage({
      leaseId: lease.id,
      fromEmail: lease.tenantEmail,
      toEmail: lease.landlordEmail,
      text: `${lease.tenantEmail} deposited into escrow for ${lease.propertyAddress}${cautionAmount > 0 ? ` (including a ${cautionAmount.toFixed(2)} USDC refundable caution fee)` : ""} — awaiting your signature.`,
    });
    recordConstitutionAcceptance(lease.id);
    return { lease, hash };
  }

  const { hash } = await sendGaslessTransaction({
    from: input.tenantAddress,
    to: input.tenantAddress,
    data: "0x",
    description: `createLease(${input.propertyAddress})`,
  });
  const lease = mockStore.createLease(input);
  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.tenantEmail,
    toEmail: lease.landlordEmail,
    text: `${lease.tenantEmail} deposited into escrow for ${lease.propertyAddress} — awaiting your signature.`,
  });
  recordConstitutionAcceptance(lease.id);
  return { lease, hash };
}

export async function signLease(id: string, landlordAddress: Address): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: landlordAddress,
        to: escrowAddress,
        data: encodeSignLease(leaseId),
        description: `signLease(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.signLease(id);
  })();

  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.landlordEmail,
    toEmail: lease.tenantEmail,
    text: `Lease signed by ${lease.landlordEmail} — the lease is now active.`,
  });
  return lease;
}

export async function releaseTranche(id: string, callerAddress: Address): Promise<Lease> {
  const previous = await getLease(id);
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: callerAddress,
        to: escrowAddress,
        data: encodeReleaseTranche(leaseId),
        description: `releaseTranche(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.releaseTranche(id);
  })();

  const released = lease.periodsReleased - (previous?.periodsReleased ?? 0);
  const amount = released * lease.amountPerPeriod;
  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.tenantEmail,
    toEmail: lease.landlordEmail,
    text: `Tranche released — ${amount.toFixed(2)} USDC for ${released} period${released === 1 ? "" : "s"} (${lease.periodsReleased}/${lease.totalPeriods} total).`,
  });
  return lease;
}

export async function raiseDispute(id: string, reason: string, tenantAddress: Address): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: tenantAddress,
        to: escrowAddress,
        data: encodeRaiseDispute(leaseId, reason),
        description: `raiseDispute(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.raiseDispute(id, reason);
  })();

  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.tenantEmail,
    toEmail: lease.landlordEmail,
    text: `Dispute raised: ${reason}`,
  });
  return lease;
}

function splitSummary(landlordBps: number): string {
  if (landlordBps === BPS_DENOMINATOR) return "the schedule resumes, in full to the landlord";
  if (landlordBps === 0) return "the remaining escrow is refunded in full to the tenant";
  return `the remaining escrow is split ${(landlordBps / 100).toFixed(1)}% landlord / ${(100 - landlordBps / 100).toFixed(1)}% tenant, now`;
}

/** Arbiter-only, ratio resolution — only callable once the 7-day settlement window has closed. */
export async function resolveDispute(
  id: string,
  landlordBps: number,
  arbiterAddress: Address,
  reasoning: string,
): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: arbiterAddress,
        to: escrowAddress,
        data: encodeResolveDispute(leaseId, landlordBps),
        description: `resolveDispute(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.resolveDispute(id, landlordBps);
  })();

  recordRuling(lease, reasoning);
  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.landlordEmail,
    toEmail: lease.tenantEmail,
    text: `Dispute resolved by the arbiter — ${splitSummary(landlordBps)}.`,
  });
  return lease;
}

/** Either party proposes a landlord/tenant split — Article 4.3, Tier 1 direct settlement. */
export async function proposeSettlement(
  id: string,
  proposerRole: "tenant" | "landlord",
  landlordBps: number,
  proposerAddress: Address,
): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: proposerAddress,
        to: escrowAddress,
        data: encodeProposeSettlement(leaseId, landlordBps),
        description: `proposeSettlement(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.proposeSettlement(id, proposerRole, landlordBps);
  })();

  const otherEmail = proposerRole === "tenant" ? lease.landlordEmail : lease.tenantEmail;
  const selfEmail = proposerRole === "tenant" ? lease.tenantEmail : lease.landlordEmail;
  postSystemMessage({
    leaseId: lease.id,
    fromEmail: selfEmail,
    toEmail: otherEmail,
    text: `Settlement proposed — ${splitSummary(landlordBps)}.`,
  });
  return lease;
}

/** The non-proposing party accepts the open settlement — finalizes immediately, no arbiter needed. */
export async function acceptSettlement(
  id: string,
  acceptorRole: "tenant" | "landlord",
  acceptorAddress: Address,
): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: acceptorAddress,
        to: escrowAddress,
        data: encodeAcceptSettlement(leaseId),
        description: `acceptSettlement(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.acceptSettlement(id, acceptorRole);
  })();

  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.tenantEmail,
    toEmail: lease.landlordEmail,
    text: `Settlement accepted — dispute resolved without arbitration.`,
  });
  return lease;
}

/** Permissionless — resolves 100% to landlord if the arbiter never rules within the 5-day arbitration window. */
export async function autoResolveOverdueDispute(id: string, callerAddress: Address): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: callerAddress,
        to: escrowAddress,
        data: encodeAutoResolveOverdueDispute(leaseId),
        description: `autoResolveOverdueDispute(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.autoResolveOverdueDispute(id);
  })();

  recordRuling(
    lease,
    "No ruling was recorded within the 5-day arbitration window. Per Article 4.4's Ruling Deadline Fallback, the remaining escrow released in full to the landlord and the lease schedule resumed automatically. This is a procedural outcome, not a judgment on the merits of the dispute.",
  );
  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.landlordEmail,
    toEmail: lease.tenantEmail,
    text: `The arbiter missed the ruling deadline — the dispute auto-resolved to the landlord per Article 4.4.`,
  });
  return lease;
}

/** Landlord files an itemized damage claim against the caution fee — Article 6.6-6.7. The undisputed remainder releases immediately; the claimed amount enters the same settlement/arbitration path as a rent dispute. */
export async function fileDepositClaim(
  id: string,
  claimAmount: number,
  evidenceHash: `0x${string}`,
  landlordAddress: Address,
): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: landlordAddress,
        to: escrowAddress,
        data: encodeFileDepositClaim(leaseId, claimAmount, evidenceHash),
        description: `fileDepositClaim(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.fileDepositClaim(id, claimAmount, evidenceHash);
  })();

  const remainder = lease.cautionAmount - claimAmount;
  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.landlordEmail,
    toEmail: lease.tenantEmail,
    text: `Landlord filed a caution fee claim of ${claimAmount.toFixed(2)} USDC.${remainder > 0 ? ` The undisputed remainder of ${remainder.toFixed(2)} USDC released to you immediately.` : ""} The claimed amount enters the dispute process.`,
  });
  return lease;
}

/** Permissionless — releases the full caution fee to the tenant once the 7-day claim window has passed with no claim filed. Article 6.5. */
export async function releaseCaution(id: string, callerAddress: Address): Promise<Lease> {
  const lease = await (async () => {
    if (!MOCK_MODE) {
      if (!escrowAddress) throw new Error("Contract not configured.");
      const leaseId = BigInt(id);
      await sendGaslessTransaction({
        from: callerAddress,
        to: escrowAddress,
        data: encodeReleaseCaution(leaseId),
        description: `releaseCaution(${id})`,
      });
      return onChainLeaseToLease(leaseId);
    }
    return mockStore.releaseCaution(id);
  })();

  postSystemMessage({
    leaseId: lease.id,
    fromEmail: lease.landlordEmail,
    toEmail: lease.tenantEmail,
    text: `Caution fee returned — ${lease.cautionAmount.toFixed(2)} USDC ✓`,
  });
  return lease;
}

export async function getLease(id: string): Promise<Lease | null> {
  if (!MOCK_MODE) {
    try {
      return await cachedChainRead(`lease:${id}`, () => onChainLeaseToLease(BigInt(id)));
    } catch {
      return null;
    }
  }
  return mockStore.getLease(id);
}

export async function listLeasesForTenant(params: { email: string; address: Address }): Promise<Lease[]> {
  if (!MOCK_MODE) {
    return cachedChainRead(`leases:tenant:${params.address}`, async () => {
      const ids = await findLeaseIdsForAddress(params.address, "tenant");
      const leases = await Promise.all(ids.map((id) => onChainLeaseToLease(BigInt(id))));
      return leases.sort((a, b) => b.createdAt - a.createdAt);
    });
  }
  return mockStore.listLeasesForTenant(params.email);
}

export async function listLeasesForLandlord(params: { email: string; address: Address }): Promise<Lease[]> {
  if (!MOCK_MODE) {
    return cachedChainRead(`leases:landlord:${params.address}`, async () => {
      const ids = await findLeaseIdsForAddress(params.address, "landlord");
      const leases = await Promise.all(ids.map((id) => onChainLeaseToLease(BigInt(id))));
      return leases.sort((a, b) => b.createdAt - a.createdAt);
    });
  }
  return mockStore.listLeasesForLandlord(params.email);
}

export { readOnChainPendingPeriods };
export type { ReputationStats, ActivityItem };

export interface CautionReturnRate {
  rate: number;
  returned: number;
  total: number;
}

/**
 * Article VII.1 — "Caution fee return rate": the share of a landlord's
 * completed, caution-fee-bearing leases where the fee auto-released in full
 * (never claimed) or a filed claim was ruled invalid (resolved 0% to the
 * landlord). Null when the landlord has no settled caution-fee leases yet,
 * so the UI can show "no history" instead of a misleading 0%.
 */
export async function getCautionReturnRate(params: { email: string; address: Address }): Promise<CautionReturnRate | null> {
  const leases = await listLeasesForLandlord(params);
  const settled = leases.filter((l) => l.cautionAmount > 0 && l.cautionSettled);
  if (settled.length === 0) return null;

  const returned = settled.filter(
    (l) => l.cautionClaimFiledAt === null || l.cautionClaimLandlordBps === 0,
  ).length;

  return { rate: returned / settled.length, returned, total: settled.length };
}

/**
 * Rental reputation, computed live — completed leases and dispute outcomes.
 * Real mode scans actual contract events. Mock mode computes the same shape
 * from the localStorage lease history for the current browser session.
 */
export async function getReputationStats(params: { email: string; address: Address }): Promise<ReputationStats> {
  if (!MOCK_MODE) {
    return cachedChainRead(`reputation:${params.address}`, () => getOnChainReputationStats(params.address));
  }

  const tenantLeases = mockStore.listLeasesForTenant(params.email);
  const landlordLeases = mockStore.listLeasesForLandlord(params.email);
  const isCompleted = (l: mockStore.Lease) => !l.cancelled && l.periodsReleased >= l.totalPeriods;

  const ownResolutions = tenantLeases.flatMap((l) => l.resolvedDisputes ?? []);
  const disputesRaised = tenantLeases.filter((l) => l.disputeRaisedAt !== null || (l.resolvedDisputes ?? []).length > 0)
    .length;

  return {
    completedAsTenant: tenantLeases.filter(isCompleted).length,
    completedAsLandlord: landlordLeases.filter(isCompleted).length,
    totalAsTenant: tenantLeases.length,
    totalAsLandlord: landlordLeases.length,
    disputesRaised,
    disputesWonAsTenant: ownResolutions.filter((r) => r.landlordBps < BPS_DENOMINATOR / 2).length,
    disputesLostAsTenant: ownResolutions.filter((r) => r.landlordBps >= BPS_DENOMINATOR / 2).length,
    disputesPending: tenantLeases.filter((l) => l.disputeActive).length,
  };
}

/**
 * Recent activity — deposits, signatures, releases, disputes. Real mode
 * scans actual contract events (each item carries a real tx hash to link to
 * the Arc explorer). Mock mode derives the same shape from the lease fields
 * localStorage genuinely tracks (createdAt/signedAt/dispute timestamps) —
 * there's no mock chain, so those items carry no tx hash rather than a
 * fabricated one. Mock mode has no per-release timestamps (only the running
 * periodsReleased count), so "release" activity isn't shown there.
 */
export async function getActivityFeed(params: { email: string; address: Address }, limit = 12): Promise<ActivityItem[]> {
  if (!MOCK_MODE) {
    return cachedChainRead(`activity:${params.address}:${limit}`, () => getOnChainActivityFeed(params.address, limit));
  }

  const tenantLeases = mockStore.listLeasesForTenant(params.email);
  const landlordLeases = mockStore.listLeasesForLandlord(params.email);
  const seen = new Set<string>();
  const items: ActivityItem[] = [];

  for (const l of [...tenantLeases, ...landlordLeases]) {
    if (seen.has(l.id)) continue;
    seen.add(l.id);

    items.push({
      id: `${l.id}-deposit`,
      type: "deposit",
      leaseId: l.id,
      timestamp: l.createdAt,
      amount: l.amountPerPeriod * l.totalPeriods,
      txHash: null,
    });
    if (l.signedAt) {
      items.push({ id: `${l.id}-signed`, type: "signed", leaseId: l.id, timestamp: l.signedAt, amount: null, txHash: null });
    }
    if (l.disputeRaisedAt) {
      items.push({
        id: `${l.id}-dispute-raised`,
        type: "dispute-raised",
        leaseId: l.id,
        timestamp: l.disputeRaisedAt,
        amount: null,
        txHash: null,
      });
    }
    for (const [i, r] of (l.resolvedDisputes ?? []).entries()) {
      items.push({
        id: `${l.id}-dispute-resolved-${i}`,
        type: "dispute-resolved",
        leaseId: l.id,
        timestamp: r.resolvedAt,
        amount: null,
        txHash: null,
      });
    }
  }

  return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
}

export const escrowContractAddress = escrowAddress;

/**
 * The "on-chain proof" panel for a single lease — every real transaction
 * against it (creation, signature, each release, disputes), each linkable
 * to the Arc explorer. Only meaningful in real mode; mock mode has no chain
 * to prove anything on, so it returns an empty list rather than fabricating
 * transaction hashes.
 */
export async function getLeaseActivity(id: string): Promise<ActivityItem[]> {
  if (MOCK_MODE) return [];
  return cachedChainRead(`lease-activity:${id}`, () => getOnChainLeaseActivity(BigInt(id)));
}

export type { TenancyCredentialSummary };

/**
 * Soulbound tenancy credentials owned by `address` — scanned live from
 * mint events, never stored separately. Mock mode has no chain and no
 * TenancyCredential contract to mint on, so it returns an empty list
 * rather than fabricating a credential that was never actually earned.
 */
export async function getTenancyCredentials(address: Address): Promise<TenancyCredentialSummary[]> {
  if (MOCK_MODE) return [];
  // bigint fields — cached in memory only (sessionStorage persist silently skips it)
  return cachedChainRead(`credentials:${address}`, () => getCredentialsForOwner(address));
}
