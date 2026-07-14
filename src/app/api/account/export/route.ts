import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/profileServer";
import { listListingsForLandlord } from "@/lib/listingServer";
import { listReviewsForEmail } from "@/lib/reviewServer";
import { listAllMessagesForEmail } from "@/lib/messageServer";
import { getPrefs } from "@/lib/notificationPrefsServer";
import { getPrivacyPrefs } from "@/lib/privacyServer";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });

  const [profile, listings, reviewsReceived, messages, notificationPrefs, privacyPrefs] = await Promise.all([
    getProfile(email),
    listListingsForLandlord(email),
    listReviewsForEmail(email),
    listAllMessagesForEmail(email),
    getPrefs(email),
    getPrivacyPrefs(email),
  ]);

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    email,
    profile,
    listings,
    reviewsReceived,
    messages,
    notificationPrefs,
    privacyPrefs,
  });
}
