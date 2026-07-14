import { NextRequest, NextResponse } from "next/server";
import { getListing, deactivateListing } from "@/lib/listingServer";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const listing = await getListing(params.id);
  if (!listing) return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  return NextResponse.json({ listing });
}

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  await deactivateListing(params.id);
  return NextResponse.json({ ok: true });
}
