import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/lib/profileServer";
import { listListingsForLandlord } from "@/lib/listingServer";
import { listPublishedReviewsForEmail } from "@/lib/reviewServer";
import { listAllMessagesForEmail } from "@/lib/messageServer";
import { getPrefs } from "@/lib/notificationPrefsServer";
import { getPrivacyPrefs } from "@/lib/privacyServer";
import { errorResponse, requireSelf } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

/** "Download my data" — only ever the signed-in user's own (it includes every private message). */
export async function GET(req: NextRequest) {
  try {
    const email = await requireSelf(req.nextUrl.searchParams.get("email"));

    const [profile, listings, reviewsReceived, messages, notificationPrefs, privacyPrefs] = await Promise.all([
      getProfile(email),
      listListingsForLandlord(email, true),
      listPublishedReviewsForEmail(email),
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
  } catch (error) {
    return errorResponse(error);
  }
}
