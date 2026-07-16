import { NextRequest, NextResponse } from "next/server";
import { reserveListing, reactivateListing } from "@/lib/listingServer";

/** Claims the listing for the caller now starting escrow funding. See listingServer.ts docstring. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const reserved = await reserveListing(params.id);
  return NextResponse.json({ reserved });
}

/** Rolls back a claim when the deposit that followed it failed. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await reactivateListing(params.id);
  return NextResponse.json({ ok: true });
}
