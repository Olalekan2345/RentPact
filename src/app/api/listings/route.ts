import { NextRequest, NextResponse } from "next/server";
import { listActiveListings, listListingsForLandlord, createListing } from "@/lib/listingServer";

export async function GET(req: NextRequest) {
  const landlordEmail = req.nextUrl.searchParams.get("landlordEmail");
  const listings = landlordEmail ? await listListingsForLandlord(landlordEmail) : await listActiveListings();
  return NextResponse.json({ listings });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      landlordEmail,
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
    } = body;

    if (
      !landlordEmail ||
      !landlordAddress ||
      !propertyAddress ||
      !propertyType ||
      !amountPerPeriod ||
      !totalPeriods ||
      !frequency
    ) {
      return NextResponse.json({ error: "Missing required listing fields" }, { status: 400 });
    }

    const listing = await createListing({
      landlordEmail: landlordEmail.trim().toLowerCase(),
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
    });
    return NextResponse.json({ listing });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
