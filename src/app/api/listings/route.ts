import { NextRequest, NextResponse } from "next/server";
import { listActiveListings, listListingsForLandlord, createListing } from "@/lib/listingServer";
import { errorResponse, HttpError, ownsWallet, requireUser, sessionUser } from "@/lib/sessionServer";
import {
  carryOverApproval,
  checkPropertyDocuments,
  landlordStatus,
  submitPropertyDocuments,
} from "@/lib/verificationServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const landlordEmail = req.nextUrl.searchParams.get("landlordEmail")?.trim().toLowerCase();
  if (!landlordEmail) return NextResponse.json({ listings: await listActiveListings() });
  // A landlord sees their own pending and rejected listings too; everyone else sees only public ones.
  const viewer = await sessionUser();
  const listings = await listListingsForLandlord(landlordEmail, viewer?.email === landlordEmail);
  return NextResponse.json({ listings });
}

/**
 * Publishes a listing for the signed-in landlord. The landlord is whoever the session says, never the
 * request body; the rent wallet must be one of their own; they must be a verified landlord; and the
 * listing waits in RentPact's review queue with its ownership documents until the team approves it —
 * except "List again" of a property already approved for this landlord at the same address.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const {
      landlordAddress,
      propertyAddress,
      propertyType,
      photoUrl,
      amountPerPeriod,
      totalPeriods,
      frequency,
      condition,
      amenities,
      securityDeposit,
      houseRules,
      noticePeriodDays,
      relistOf,
    } = body;

    if (!landlordAddress || !propertyAddress || !propertyType || !amountPerPeriod || !totalPeriods || !frequency) {
      throw new HttpError("Missing required listing fields", 400);
    }

    const { status, role } = await landlordStatus(user.email);
    if (status !== "approved") {
      throw new HttpError("Only verified landlords can list properties. Get verified first.", 403);
    }
    if (!(await ownsWallet(user.email, String(landlordAddress)))) {
      throw new HttpError("Rent must be paid to your own RentPact wallet.", 403);
    }

    const relistFrom = typeof relistOf === "string" && relistOf ? relistOf : null;
    // Documents are checked before anything is created, so a bad upload never leaves a half-made listing.
    // A re-list may skip them; if its approval doesn't carry over, it needs them after all.
    const documents = relistFrom && !body.documents?.length ? null : checkPropertyDocuments(user, role, body);

    const listing = await createListing(
      {
        landlordEmail: user.email,
        landlordAddress,
        propertyAddress,
        propertyType,
        photoUrl: photoUrl ?? null,
        amountPerPeriod,
        totalPeriods,
        frequency,
        condition: condition ?? null,
        amenities: amenities ?? [],
        securityDeposit: securityDeposit ?? null,
        houseRules: houseRules ?? "",
        noticePeriodDays: noticePeriodDays ?? null,
      },
      "pending",
    );

    if (relistFrom && (await carryOverApproval(relistFrom, listing.id, user.email, propertyAddress))) {
      return NextResponse.json({ listing: { ...listing, verificationStatus: "approved" } });
    }
    if (!documents) {
      // Not a carry-over after all (different address, or the old listing was never verified).
      return NextResponse.json({ listing, needsDocuments: true });
    }
    await submitPropertyDocuments(listing.id, user.email, documents);
    return NextResponse.json({ listing });
  } catch (error) {
    return errorResponse(error);
  }
}
