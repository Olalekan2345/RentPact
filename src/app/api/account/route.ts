import { NextRequest, NextResponse } from "next/server";
import { deleteProfile } from "@/lib/profileServer";
import { deactivateAllListingsForLandlord } from "@/lib/listingServer";
import { deleteAllUserData as deletePrivacyPrefs } from "@/lib/privacyServer";

/**
 * "Delete account" scrubs personal profile data (name/photo) and
 * preferences, and takes any active listings down. It deliberately does
 * NOT delete leases, messages, or reviews — this is an escrow platform, and
 * removing financial/agreement history would corrupt the counterparty's
 * side of a real transaction record. That's a real constraint, not a
 * shortcut: most real financial platforms behave the same way.
 */
export async function DELETE(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ error: "email query param is required" }, { status: 400 });

  await Promise.all([deleteProfile(email), deactivateAllListingsForLandlord(email), deletePrivacyPrefs(email)]);

  return NextResponse.json({ ok: true });
}
