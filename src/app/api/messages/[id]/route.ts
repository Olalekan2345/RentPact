import { NextRequest, NextResponse } from "next/server";
import { updateMaintenanceStatus } from "@/lib/messageServer";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { status, requesterEmail } = await req.json();
    if (!status || !requesterEmail) {
      return NextResponse.json({ error: "status and requesterEmail are required" }, { status: 400 });
    }
    const message = await updateMaintenanceStatus(params.id, status, requesterEmail);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
