import "server-only";
import { getLeaseMetadata } from "@/lib/leaseMetadataServer";
import { arbiterAddress } from "@/lib/contracts/rentPactEscrow";
import { HttpError, isMockMode, ownsWallet, type SessionUser } from "@/lib/sessionServer";
import { isReviewer } from "@/lib/verificationServer";

export type LeaseAccessRole = "tenant" | "landlord" | "arbiter";

/** Whether `email` is the arbiter: on the review team, or in control of the arbiter wallet. */
export async function isArbiterEmail(email: string): Promise<boolean> {
  if (isReviewer(email)) return true;
  return Boolean(arbiterAddress) && !isMockMode() && (await ownsWallet(email, arbiterAddress as string));
}

/**
 * Only a lease's own tenant or landlord (and, where allowed, the arbiter) may read or write its records —
 * messages, move-out reports, activity, the constitution acceptance. Parties come from lease_metadata,
 * which is written once by the tenant who created the lease. Mock mode keeps leases in the browser, so the
 * server has no record to check against there.
 */
export async function requireLeaseAccess(
  leaseId: string,
  user: SessionUser,
  options: { allowArbiter?: boolean } = {},
): Promise<LeaseAccessRole | null> {
  if (isMockMode()) return null;
  const metadata = await getLeaseMetadata(leaseId);
  if (metadata?.tenantEmail.trim().toLowerCase() === user.email) return "tenant";
  if (metadata?.landlordEmail.trim().toLowerCase() === user.email) return "landlord";
  if (options.allowArbiter && (await isArbiterEmail(user.email))) return "arbiter";
  throw new HttpError(metadata ? "Only the tenant and landlord of this lease can do this." : "Lease not found.", metadata ? 403 : 404);
}
