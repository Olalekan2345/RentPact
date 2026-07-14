import { NextRequest, NextResponse } from "next/server";
import { listTemplatesForLandlord, createTemplate } from "@/lib/templateServer";

export async function GET(req: NextRequest) {
  const landlordEmail = req.nextUrl.searchParams.get("landlordEmail");
  if (!landlordEmail) return NextResponse.json({ error: "landlordEmail query param is required" }, { status: 400 });
  const templates = await listTemplatesForLandlord(landlordEmail);
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      landlordEmail,
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

    if (!landlordEmail || !name || !propertyType || !amountPerPeriod || !totalPeriods || !frequency) {
      return NextResponse.json({ error: "Missing required template fields" }, { status: 400 });
    }

    const template = await createTemplate({
      landlordEmail: landlordEmail.trim().toLowerCase(),
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
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
