import { NextRequest, NextResponse } from "next/server";
import { getLeaseMetadata, saveLeaseMetadata } from "@/lib/leaseMetadataServer";
import { readLease } from "@/lib/contracts/onChainLease";
import { errorResponse, HttpError, isMockMode, ownsWallet, requireSelf } from "@/lib/sessionServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  if (!leaseId) return NextResponse.json({ error: "leaseId query param is required" }, { status: 400 });
  const metadata = await getLeaseMetadata(leaseId);
  return NextResponse.json({ metadata });
}

/**
 * Records who a lease's parties are. Written by the tenant who just created it on-chain: the caller must be
 * that tenant, paying from their own wallet, and can't overwrite a lease someone else recorded.
 */
export async function POST(req: NextRequest) {
  try {
    const { leaseId, propertyAddress, propertyType, photoUrl, tenantEmail, landlordEmail, tenantAddress, landlordAddress } =
      await req.json();

    if (!leaseId || !propertyAddress || !propertyType || !tenantEmail || !landlordEmail || !tenantAddress || !landlordAddress) {
      throw new HttpError(
        "leaseId, propertyAddress, propertyType, tenantEmail, landlordEmail, tenantAddress, landlordAddress are required",
        400,
      );
    }

    const tenant = await requireSelf(tenantEmail);
    const existing = await getLeaseMetadata(String(leaseId));
    if (existing && existing.tenantEmail.trim().toLowerCase() !== tenant) {
      throw new HttpError("This lease was recorded by someone else.", 403);
    }
    if (!isMockMode()) {
      if (!(await ownsWallet(tenant, String(tenantAddress)))) {
        throw new HttpError("The tenant wallet must be your own.", 403);
      }
      // The on-chain lease must actually be between these wallets. Best-effort: an RPC hiccup right after
      // creation shouldn't lose the record, and the wallet check above already binds the caller.
      const onChain = await readLease(BigInt(leaseId)).catch(() => null);
      if (
        onChain &&
        (onChain.tenant.toLowerCase() !== String(tenantAddress).toLowerCase() ||
          onChain.landlord.toLowerCase() !== String(landlordAddress).toLowerCase())
      ) {
        throw new HttpError("These wallets don't match the lease on-chain.", 403);
      }
    }

    await saveLeaseMetadata(String(leaseId), {
      propertyAddress,
      propertyType,
      photoUrl: photoUrl ?? null,
      tenantEmail: tenant,
      landlordEmail,
      tenantAddress,
      landlordAddress,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
