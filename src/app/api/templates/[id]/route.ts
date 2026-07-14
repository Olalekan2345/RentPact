import { NextRequest, NextResponse } from "next/server";
import { deleteTemplate } from "@/lib/templateServer";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const landlordEmail = req.nextUrl.searchParams.get("landlordEmail");
  if (!landlordEmail) return NextResponse.json({ error: "landlordEmail query param is required" }, { status: 400 });
  await deleteTemplate(params.id, landlordEmail);
  return NextResponse.json({ ok: true });
}
