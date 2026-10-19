import { NextRequest, NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/sessionServer";
import { reportListing } from "@/lib/verificationServer";

/** "Report this listing" — goes to the RentPact review team. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { email } = await requireUser();
    const body = await req.json().catch(() => ({}));
    await reportListing(email, params.id, String(body.reason ?? ""));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
