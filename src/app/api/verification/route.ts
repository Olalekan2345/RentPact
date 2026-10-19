import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/sessionServer";
import { getMyVerification, isReviewer, submitLandlordApplication } from "@/lib/verificationServer";

export const dynamic = "force-dynamic";

/** The signed-in user's own landlord verification, and whether they're on the review team. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ verification: await getMyVerification(user.email), isReviewer: isReviewer(user.email) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Applies (or re-applies after a rejection) to become a verified landlord. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await submitLandlordApplication(user, await req.json());
    return NextResponse.json({ verification: await getMyVerification(user.email) });
  } catch (error) {
    return errorResponse(error);
  }
}
