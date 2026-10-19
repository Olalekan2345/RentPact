import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate } from "@/lib/templateServer";
import { errorResponse, requireSelf } from "@/lib/sessionServer";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await deleteTemplate(params.id, await requireSelf(req.nextUrl.searchParams.get("landlordEmail")));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
