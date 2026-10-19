import { NextRequest, NextResponse } from "next/server";
import { updateMaintenanceStatus } from "@/lib/messageServer";
import { errorResponse, HttpError, requireSelf } from "@/lib/sessionServer";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, requesterEmail } = await req.json();
    if (!status || !requesterEmail) throw new HttpError("status and requesterEmail are required", 400);
    const message = await updateMaintenanceStatus(params.id, status, await requireSelf(requesterEmail));
    return NextResponse.json({ message });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
