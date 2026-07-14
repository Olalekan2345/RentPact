import { NextRequest, NextResponse } from "next/server";
import { listMessagesForLease, listMessagesForListing, listThreadsForEmail, createMessage } from "@/lib/messageServer";

export async function GET(req: NextRequest) {
  const leaseId = req.nextUrl.searchParams.get("leaseId");
  const listingId = req.nextUrl.searchParams.get("listingId");
  const forEmail = req.nextUrl.searchParams.get("forEmail");
  const viewerEmail = req.nextUrl.searchParams.get("viewerEmail");
  const withEmail = req.nextUrl.searchParams.get("withEmail");

  if (leaseId) {
    const messages = await listMessagesForLease(leaseId);
    return NextResponse.json({ messages });
  }
  if (listingId) {
    if (!viewerEmail || !withEmail) {
      return NextResponse.json({ error: "viewerEmail and withEmail are required for a listing thread" }, { status: 400 });
    }
    const messages = await listMessagesForListing(listingId, viewerEmail, withEmail);
    return NextResponse.json({ messages });
  }
  if (forEmail) {
    const threads = await listThreadsForEmail(forEmail);
    return NextResponse.json({ threads });
  }
  return NextResponse.json({ error: "leaseId, listingId, or forEmail query param is required" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { leaseId, listingId, fromEmail, toEmail, type, text, maintenance } = body;

    if (!leaseId && !listingId) {
      return NextResponse.json({ error: "leaseId or listingId is required" }, { status: 400 });
    }
    if (!fromEmail || !toEmail || !type) {
      return NextResponse.json({ error: "fromEmail, toEmail, type are required" }, { status: 400 });
    }

    const message = await createMessage({
      leaseId: leaseId ?? null,
      listingId: listingId ?? null,
      fromEmail: fromEmail.trim().toLowerCase(),
      toEmail: toEmail.trim().toLowerCase(),
      type,
      text: text ?? "",
      maintenance: maintenance ?? null,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
