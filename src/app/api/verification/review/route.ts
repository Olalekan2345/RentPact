import { NextRequest, NextResponse } from "next/server";
import { errorResponse, HttpError, sessionUser } from "@/lib/sessionServer";
import { decideLandlord, decideListing, requireReviewer, resolveReport, reviewQueue } from "@/lib/verificationServer";

export const dynamic = "force-dynamic";

/** The review team's queue: landlord applications, properties awaiting checks, open reports. */
export async function GET() {
  try {
    requireReviewer(await sessionUser());
    return NextResponse.json(await reviewQueue());
  } catch (error) {
    return errorResponse(error);
  }
}

/** A reviewer's decision on one item of the queue. */
export async function POST(req: NextRequest) {
  try {
    const reviewer = requireReviewer(await sessionUser());
    const body = await req.json();
    const note = typeof body.note === "string" ? body.note : "";
    const checks: Record<string, boolean> =
      body.checks && typeof body.checks === "object"
        ? Object.fromEntries(Object.entries(body.checks).map(([k, v]) => [k, v === true]))
        : {};

    if (body.target === "landlord" && ["approve", "reject", "revoke"].includes(body.decision)) {
      await decideLandlord(reviewer, String(body.id), body.decision, note, checks);
    } else if (body.target === "listing" && ["approve", "reject"].includes(body.decision)) {
      await decideListing(reviewer, String(body.id), body.decision, note, checks);
    } else if (body.target === "report" && ["dismiss", "take-down", "revoke-landlord"].includes(body.decision)) {
      await resolveReport(reviewer, String(body.id), body.decision, note);
    } else {
      throw new HttpError("Unknown decision.", 400);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
