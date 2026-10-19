import { NextRequest, NextResponse } from "next/server";
import { listTemplatesForLandlord, createTemplate } from "@/lib/templateServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const landlordEmail = await requireSelf(req.nextUrl.searchParams.get("landlordEmail"));
    return NextResponse.json({ templates: await listTemplatesForLandlord(landlordEmail) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const landlordEmail = await requireSelf(body.landlordEmail);
    const {
      name,
      propertyType,
      amenities,
      amountPerPeriod,
      totalPeriods,
      frequency,
      securityDeposit,
      houseRules,
      noticePeriodDays,
      maintenanceLandlord,
      maintenanceTenant,
    } = body;

    if (!name || !propertyType || !amountPerPeriod || !totalPeriods || !frequency) {
      throw new HttpError("Missing required template fields", 400);
    }

    const template = await createTemplate({
      landlordEmail,
      name,
      propertyType,
      amenities: amenities ?? [],
      amountPerPeriod,
      totalPeriods,
      frequency,
      securityDeposit: securityDeposit ?? null,
      houseRules: houseRules ?? "",
      noticePeriodDays: noticePeriodDays ?? null,
      maintenanceLandlord: maintenanceLandlord ?? "",
      maintenanceTenant: maintenanceTenant ?? "",
    });
    return NextResponse.json({ template });
  } catch (error) {
    return errorResponse(error);
  }
}
