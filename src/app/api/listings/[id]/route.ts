import { NextRequest, NextResponse } from "next/server";
import { getListing, deactivateListing } from "@/lib/listingServer";
import { errorResponse, HttpError, requireUser, sessionUser } from "@/lib/sessionServer";
import { isReviewer, listingVerificationSummary, PUBLIC_LISTING_STATUSES } from "@/lib/verificationServer";

export const dynamic = "force-dynamic";

/** A listing and its verification. Pending or rejected listings are visible only to their landlord and reviewers. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  const viewer = await sessionUser();
  const isOwner = viewer?.email === listing.landlordEmail;
  if (!PUBLIC_LISTING_STATUSES.includes(listing.verificationStatus) && !isOwner && !(viewer && isReviewer(viewer.email))) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  const verification = await listingVerificationSummary(listing.id, listing.verificationStatus, listing.verifiedAt, isOwner);
  return NextResponse.json({ listing, verification });
}

/** Takes the listing down — only its own landlord (or the review team) can. */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const listing = await getListing(params.id);
    if (!listing) throw new HttpError("Listing not found", 404);
    if (listing.landlordEmail !== user.email && !isReviewer(user.email)) {
      throw new HttpError("Only the landlord can remove this listing.", 403);
    }
    await deactivateListing(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
