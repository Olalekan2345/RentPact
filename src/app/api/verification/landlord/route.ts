import { NextRequest, NextResponse } from "next/server";
import { approvedLandlords } from "@/lib/verificationServer";

/** Public: whether `email` is a RentPact-verified landlord, and since when (for profile badges). */
export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email")?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });
  const since = (await approvedLandlords([email])).get(email);
  return NextResponse.json({ verified: since !== undefined, since: since ?? null });
}
