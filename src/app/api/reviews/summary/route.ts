import { NextRequest, NextResponse } from "next/server";
import { getReviewSummaries } from "@/lib/reviewServer";

const MAX_EMAILS = 60;

/** Per-role rating summaries for several users, e.g. every landlord on the browse page. */
export async function GET(req: NextRequest) {
  const emails = (req.nextUrl.searchParams.get("emails") ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .slice(0, MAX_EMAILS);
  if (emails.length === 0) return NextResponse.json({ summaries: {} });
  const summaries = await getReviewSummaries(emails);
  return NextResponse.json({ summaries });
}
