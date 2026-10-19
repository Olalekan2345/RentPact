import { NextRequest, NextResponse } from "next/server";
import { reserveListing, reactivateListing } from "@/lib/listingServer";
import { errorResponse, requireUser } from "@/lib/sessionServer";

/** Claims the listing for the signed-in tenant now starting escrow funding. See listingServer.ts docstring. */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { email } = await requireUser();
    return NextResponse.json({ reserved: await reserveListing(params.id, email) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Rolls back the signed-in tenant's own claim when the deposit that followed it failed. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { email } = await requireUser();
    await reactivateListing(params.id, email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
