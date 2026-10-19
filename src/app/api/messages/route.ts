import { NextRequest, NextResponse } from "next/server";
import { listMessagesForLease, listMessagesForListing, listThreadsForEmail, createMessage } from "@/lib/messageServer";
import { getLeaseMetadata } from "@/lib/leaseMetadataServer";
import { getListing } from "@/lib/listingServer";
import { requireLeaseAccess } from "@/lib/leaseAccessServer";
import { errorResponse, HttpError, isMockMode, requireSelf, requireUser } from "@/lib/sessionServer";

export const dynamic = "force-dynamic";

/** Threads are private: a lease thread to its two parties (and the arbiter); everything else to its own viewer. */
export async function GET(req: NextRequest) {
  try {
    const leaseId = req.nextUrl.searchParams.get("leaseId");
    const listingId = req.nextUrl.searchParams.get("listingId");
    const forEmail = req.nextUrl.searchParams.get("forEmail");
    const viewerEmail = req.nextUrl.searchParams.get("viewerEmail");
    const withEmail = req.nextUrl.searchParams.get("withEmail");

    if (leaseId) {
      await requireLeaseAccess(leaseId, await requireUser(), { allowArbiter: true });
      return NextResponse.json({ messages: await listMessagesForLease(leaseId) });
    }
    if (listingId) {
      if (!viewerEmail || !withEmail) {
        throw new HttpError("viewerEmail and withEmail are required for a listing thread", 400);
      }
      const viewer = await requireSelf(viewerEmail);
      return NextResponse.json({ messages: await listMessagesForListing(listingId, viewer, withEmail) });
    }
    if (forEmail) {
      return NextResponse.json({ threads: await listThreadsForEmail(await requireSelf(forEmail)) });
    }
    throw new HttpError("leaseId, listingId, or forEmail query param is required", 400);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Sends a message as the signed-in user. Lease "system" notices ("Lease signed", "Dispute resolved") are
 * posted by whichever party's action caused them, so they may name either party as sender — but both
 * sender and recipient must be the lease's own parties. A listing inquiry must involve that listing's landlord.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { leaseId, listingId, fromEmail, toEmail, type, text, maintenance, attachments, repairCreditAmount } = body;

    if (!leaseId && !listingId) throw new HttpError("leaseId or listingId is required", 400);
    if (!fromEmail || !toEmail || !type) throw new HttpError("fromEmail, toEmail, type are required", 400);
    const from = String(fromEmail).trim().toLowerCase();
    const to = String(toEmail).trim().toLowerCase();

    if (leaseId) {
      const role = await requireLeaseAccess(String(leaseId), user, { allowArbiter: true });
      if (type === "system" && !isMockMode()) {
        const metadata = await getLeaseMetadata(String(leaseId));
        const parties = [metadata?.tenantEmail.toLowerCase(), metadata?.landlordEmail.toLowerCase()];
        if (!parties.includes(from) || !parties.includes(to)) throw new HttpError("Invalid lease notice.", 403);
      } else if (from !== user.email && role !== null) {
        throw new HttpError("You can only send messages as yourself.", 403);
      }
    } else {
      if (from !== user.email) throw new HttpError("You can only send messages as yourself.", 403);
      const listing = await getListing(String(listingId));
      if (!listing) throw new HttpError("Listing not found", 404);
      if (listing.landlordEmail !== from && listing.landlordEmail !== to) {
        throw new HttpError("Listing messages go to or from the listing's landlord.", 403);
      }
    }

    const message = await createMessage({
      leaseId: leaseId ?? null,
      listingId: listingId ?? null,
      fromEmail: from,
      toEmail: to,
      type,
      text: text ?? "",
      deliveredAt: null,
      maintenance: maintenance ?? null,
      attachments: Array.isArray(attachments) ? attachments : [],
      repairCreditAmount: typeof repairCreditAmount === "number" ? repairCreditAmount : null,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return errorResponse(error);
  }
}
