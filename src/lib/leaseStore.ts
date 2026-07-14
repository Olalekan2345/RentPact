import type { ReleaseFrequency } from "@/components/escrow";
import { INTERVAL_DAYS } from "@/lib/contracts/frequency";
import { SETTLEMENT_WINDOW_MS, ARBITRATION_WINDOW_MS, CAUTION_CLAIM_WINDOW_MS } from "@/lib/constitution";

export const BPS_DENOMINATOR = 10_000;
export type ResolutionType = "settlement" | "arbitration" | "auto-fallback";

/**
 * Client-side lease data layer.
 *
 * RentPactEscrow.sol is the source of truth once deployed and wired via
 * NEXT_PUBLIC_RENTPACT_ESCROW_ADDRESS (see src/lib/contracts/rentPactEscrow.ts
 * for the read path against the real contract). Until a deployment address is
 * configured, this module mirrors the exact same lifecycle rules — sign
 * deadline, per-frequency interval, dispute freeze — against a localStorage
 * ledger scoped to the signed-in user, so the UI has real, user-generated data
 * to render instead of fixtures. No lease is ever pre-populated: a new user
 * always starts at an empty list.
 */

export type LeaseStatus = "awaiting-signature" | "active" | "disputed" | "completed" | "cancelled";

export interface Lease {
  id: string;
  tenantEmail: string;
  landlordEmail: string;
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  amountPerPeriod: number;
  totalPeriods: number;
  periodsReleased: number;
  frequency: ReleaseFrequency;
  createdAt: number;
  signedAt: number | null;
  disputeActive: boolean;
  disputeRaisedAt: number | null;
  disputeReason: string | null;
  cancelled: boolean;
  /** bps out of 10_000 a party has proposed the landlord keep; null if no open proposal. */
  settlementProposedBps: number | null;
  settlementProposer: "tenant" | "landlord" | null;
  disputeIsCautionClaim: boolean;
  /** History of resolved disputes on this lease — powers reputation scoring. */
  resolvedDisputes: { raisedAt: number; resolvedAt: number; landlordBps: number; resolutionType: ResolutionType }[];
  /** 0 means this lease has no caution fee (Article 1.6). */
  cautionAmount: number;
  /** null until the lease has released all rent tranches (or a rent dispute concludes it). */
  completedAt: number | null;
  cautionClaimedAmount: number | null;
  cautionClaimEvidenceHash: string | null;
  cautionClaimFiledAt: number | null;
  cautionSettled: boolean;
  cautionClaimResolvedAt: number | null;
  /** landlordBps the claim resolved at, if it went through settlement/arbitration/auto-fallback; null if unresolved or never claimed. */
  cautionClaimLandlordBps: number | null;
}

const STORE_KEY = "rentpact:leases:v1";
const SIGN_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000;

function readAll(): Lease[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Lease[]) : [];
  } catch {
    return [];
  }
}

function writeAll(leases: Lease[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(leases));
  } catch {
    // non-fatal — mock persistence only
  }
}

function intervalMs(frequency: ReleaseFrequency): number {
  return INTERVAL_DAYS[frequency] * 24 * 60 * 60 * 1000;
}

export function leaseStatus(lease: Lease): LeaseStatus {
  if (lease.cancelled) return "cancelled";
  if (!lease.signedAt) return "awaiting-signature";
  if (lease.disputeActive) return "disputed";
  if (lease.periodsReleased >= lease.totalPeriods) return "completed";
  return "active";
}

export function pendingPeriods(lease: Lease): number {
  if (!lease.signedAt || lease.disputeActive) return 0;
  const elapsed = Math.floor((Date.now() - lease.signedAt) / intervalMs(lease.frequency));
  const capped = Math.min(elapsed, lease.totalPeriods);
  return Math.max(capped - lease.periodsReleased, 0);
}

export function nextReleaseDate(lease: Lease): Date | null {
  if (!lease.signedAt || lease.periodsReleased >= lease.totalPeriods) return null;
  return new Date(lease.signedAt + (lease.periodsReleased + 1) * intervalMs(lease.frequency));
}

export function signDeadline(lease: Lease): Date {
  return new Date(lease.createdAt + SIGN_DEADLINE_MS);
}

export interface CreateLeaseInput {
  tenantEmail: string;
  landlordEmail: string;
  propertyAddress: string;
  propertyType: string;
  photoUrl: string | null;
  amountPerPeriod: number;
  totalPeriods: number;
  frequency: ReleaseFrequency;
  /** Optional caution fee (Article 1.6). 0 or omitted for none. */
  cautionAmount?: number;
}

export function createLease(input: CreateLeaseInput): Lease {
  const lease: Lease = {
    id: crypto.randomUUID(),
    tenantEmail: input.tenantEmail.trim().toLowerCase(),
    landlordEmail: input.landlordEmail.trim().toLowerCase(),
    propertyAddress: input.propertyAddress,
    propertyType: input.propertyType,
    photoUrl: input.photoUrl,
    amountPerPeriod: input.amountPerPeriod,
    totalPeriods: input.totalPeriods,
    periodsReleased: 0,
    frequency: input.frequency,
    createdAt: Date.now(),
    signedAt: null,
    disputeActive: false,
    disputeRaisedAt: null,
    disputeReason: null,
    cancelled: false,
    settlementProposedBps: null,
    settlementProposer: null,
    disputeIsCautionClaim: false,
    resolvedDisputes: [],
    cautionAmount: input.cautionAmount ?? 0,
    completedAt: null,
    cautionClaimedAmount: null,
    cautionClaimEvidenceHash: null,
    cautionClaimFiledAt: null,
    cautionSettled: false,
    cautionClaimResolvedAt: null,
    cautionClaimLandlordBps: null,
  };

  const leases = readAll();
  leases.push(lease);
  writeAll(leases);
  return lease;
}

function updateLease(id: string, updater: (lease: Lease) => Lease): Lease {
  const leases = readAll();
  const index = leases.findIndex((l) => l.id === id);
  if (index === -1) throw new Error("Lease not found");
  leases[index] = updater(leases[index]);
  writeAll(leases);
  return leases[index];
}

export function signLease(id: string): Lease {
  return updateLease(id, (lease) => {
    if (lease.signedAt) throw new Error("Lease already signed");
    if (Date.now() > lease.createdAt + SIGN_DEADLINE_MS) throw new Error("Sign deadline has passed");
    return { ...lease, signedAt: Date.now() };
  });
}

export function releaseTranche(id: string): Lease {
  return updateLease(id, (lease) => {
    const due = pendingPeriods(lease);
    if (due === 0) throw new Error("No periods have elapsed yet");
    const periodsReleased = lease.periodsReleased + due;
    const completedAt = periodsReleased >= lease.totalPeriods ? (lease.completedAt ?? Date.now()) : lease.completedAt;
    return { ...lease, periodsReleased, completedAt };
  });
}

export function raiseDispute(id: string, reason: string): Lease {
  return updateLease(id, (lease) => {
    if (!lease.signedAt) throw new Error("Lease is not signed yet");
    if (lease.disputeActive) throw new Error("A dispute is already active");
    if (lease.periodsReleased >= lease.totalPeriods) throw new Error("Lease is already fully released");
    return {
      ...lease,
      disputeActive: true,
      disputeRaisedAt: Date.now(),
      disputeReason: reason,
      settlementProposedBps: null,
      settlementProposer: null,
      disputeIsCautionClaim: false,
    };
  });
}

/** Either party proposes a landlord/tenant split — Article 4.3, Tier 1. */
export function proposeSettlement(id: string, proposer: "tenant" | "landlord", landlordBps: number): Lease {
  return updateLease(id, (lease) => {
    if (!lease.disputeActive) throw new Error("No active dispute");
    if (landlordBps < 0 || landlordBps > BPS_DENOMINATOR) throw new Error("Invalid split");
    if (Date.now() > lease.disputeRaisedAt! + SETTLEMENT_WINDOW_MS) throw new Error("Settlement window has closed");
    return { ...lease, settlementProposedBps: landlordBps, settlementProposer: proposer };
  });
}

/** The non-proposing party accepts the open settlement proposal — finalizes immediately. */
export function acceptSettlement(id: string, acceptor: "tenant" | "landlord"): Lease {
  return updateLease(id, (lease) => {
    if (!lease.disputeActive) throw new Error("No active dispute");
    if (lease.settlementProposer === null || lease.settlementProposedBps === null) {
      throw new Error("No settlement proposal to accept");
    }
    if (lease.settlementProposer === acceptor) throw new Error("Cannot accept your own proposal");
    if (Date.now() > lease.disputeRaisedAt! + SETTLEMENT_WINDOW_MS) throw new Error("Settlement window has closed");
    return finalizeDispute(lease, lease.settlementProposedBps, "settlement");
  });
}

/** Arbiter ratio resolution — Article 4.4, Tier 2. Only after the 7-day settlement window closes. */
export function resolveDispute(id: string, landlordBps: number): Lease {
  return updateLease(id, (lease) => {
    if (!lease.disputeActive) throw new Error("No active dispute");
    if (landlordBps < 0 || landlordBps > BPS_DENOMINATOR) throw new Error("Invalid split");
    if (Date.now() <= lease.disputeRaisedAt! + SETTLEMENT_WINDOW_MS) {
      throw new Error("Settlement window has not closed yet");
    }
    return finalizeDispute(lease, landlordBps, "arbitration");
  });
}

/** Permissionless fallback — Article 4.4 gap-fill. Resolves 100% to landlord if the arbiter never rules. */
export function autoResolveOverdueDispute(id: string): Lease {
  return updateLease(id, (lease) => {
    if (!lease.disputeActive) throw new Error("No active dispute");
    if (Date.now() <= lease.disputeRaisedAt! + SETTLEMENT_WINDOW_MS + ARBITRATION_WINDOW_MS) {
      throw new Error("Arbitration window has not elapsed yet");
    }
    return finalizeDispute(lease, BPS_DENOMINATOR, "auto-fallback");
  });
}

/**
 * Mirrors RentPactEscrow._finalizeDispute. For a rent dispute: landlordBps
 * === 10_000 exactly reproduces the old "unblock, resume schedule" behavior;
 * any other ratio (including 0) settles the entire remaining escrow now and
 * concludes the lease. For a caution claim dispute: always settles the
 * claimed amount in full immediately — there's no "resume schedule" for a
 * one-time claim. Mock mode has no separate landlord/tenant balances, so a
 * split is only reflected in resolvedDisputes/cautionClaimResolvedAt
 * history, not a paid-out sum.
 */
function finalizeDispute(lease: Lease, landlordBps: number, resolutionType: ResolutionType): Lease {
  const base = {
    ...lease,
    disputeActive: false,
    settlementProposedBps: null,
    settlementProposer: null,
  };

  if (lease.disputeIsCautionClaim) {
    return {
      ...base,
      disputeIsCautionClaim: false,
      cautionSettled: true,
      cautionClaimResolvedAt: Date.now(),
      cautionClaimLandlordBps: landlordBps,
    };
  }

  const resolution = {
    raisedAt: lease.disputeRaisedAt!,
    resolvedAt: Date.now(),
    landlordBps,
    resolutionType,
  };
  const resolvedDisputes = [...lease.resolvedDisputes, resolution];
  const withHistory = { ...base, resolvedDisputes };
  if (landlordBps === BPS_DENOMINATOR) return withHistory;
  return { ...withHistory, periodsReleased: lease.totalPeriods, completedAt: withHistory.completedAt ?? Date.now() };
}

/** Landlord files an itemized damage claim against the caution fee — Article 6.6-6.7. */
export function fileDepositClaim(id: string, claimAmount: number, evidenceHash: string): Lease {
  return updateLease(id, (lease) => {
    if (lease.cautionAmount === 0) throw new Error("This lease has no caution fee");
    if (lease.completedAt === null) throw new Error("Lease has not completed yet");
    if (lease.cautionClaimFiledAt !== null) throw new Error("A claim has already been filed");
    if (Date.now() > lease.completedAt + CAUTION_CLAIM_WINDOW_MS) throw new Error("The claim window has closed");
    if (claimAmount <= 0 || claimAmount > lease.cautionAmount) throw new Error("Invalid claim amount");
    if (!evidenceHash) throw new Error("Evidence is required");

    return {
      ...lease,
      cautionClaimedAmount: claimAmount,
      cautionClaimEvidenceHash: evidenceHash,
      cautionClaimFiledAt: Date.now(),
      disputeActive: true,
      disputeIsCautionClaim: true,
      disputeRaisedAt: Date.now(),
      disputeReason: "Caution fee damage claim",
    };
  });
}

/** Permissionless — releases the full caution fee to the tenant once the 7-day claim window has passed with no claim filed. Article 6.5. */
export function releaseCaution(id: string): Lease {
  return updateLease(id, (lease) => {
    if (lease.cautionAmount === 0) throw new Error("This lease has no caution fee");
    if (lease.completedAt === null) throw new Error("Lease has not completed yet");
    if (lease.cautionClaimFiledAt !== null) throw new Error("A claim has already been filed");
    if (lease.cautionSettled) throw new Error("Caution fee already settled");
    if (Date.now() <= lease.completedAt + CAUTION_CLAIM_WINDOW_MS) throw new Error("The claim window has not elapsed yet");

    return { ...lease, cautionSettled: true };
  });
}

export function cancelUnsigned(id: string): Lease {
  return updateLease(id, (lease) => {
    if (lease.signedAt) throw new Error("Lease already signed");
    if (Date.now() <= lease.createdAt + SIGN_DEADLINE_MS) throw new Error("Sign deadline has not passed yet");
    return { ...lease, cancelled: true, cautionSettled: true };
  });
}

export function getLease(id: string): Lease | null {
  return readAll().find((l) => l.id === id) ?? null;
}

export function listLeasesForTenant(email: string): Lease[] {
  const normalized = email.trim().toLowerCase();
  return readAll()
    .filter((l) => l.tenantEmail === normalized)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function listLeasesForLandlord(email: string): Lease[] {
  const normalized = email.trim().toLowerCase();
  return readAll()
    .filter((l) => l.landlordEmail === normalized)
    .sort((a, b) => b.createdAt - a.createdAt);
}
