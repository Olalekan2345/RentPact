import { NextRequest, NextResponse } from "next/server";
import { getListing } from "@/lib/listingServer";
import { errorResponse, HttpError, requireUser } from "@/lib/sessionServer";
import { checkPropertyDocuments, landlordStatus, submitPropertyDocuments } from "@/lib/verificationServer";

/**
 * Sends one of the signed-in landlord's own listings for review with its ownership documents: an older
 * "Not yet verified" listing, one sent back for changes, or a re-list that needs fresh documents.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const listing = await getListing(params.id);
    if (!listing || listing.landlordEmail !== user.email) throw new HttpError("Listing not found", 404);
    if (listing.verificationStatus === "approved") throw new HttpError("This property is already verified.", 409);
    const { status, role } = await landlordStatus(user.email);
    if (status !== "approved") throw new HttpError("Get verified as a landlord first.", 403);
    await submitPropertyDocuments(listing.id, user.email, checkPropertyDocuments(user, role, await req.json()));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
