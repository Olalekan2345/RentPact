import { NextRequest, NextResponse } from "next/server";
import { circleCreateUserToken } from "@/lib/circleServer";
import { circleUserIdFromEmail } from "@/lib/circleUserId";
import { errorResponse, HttpError, requireUser } from "@/lib/sessionServer";

/**
 * A Circle session token for the signed-in user's own wallet. Handing one out for any userId would let a
 * stranger act on someone else's wallet — e.g. set the PIN of one that isn't initialized yet.
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await requireUser();
    const { userId } = await req.json();
    if (userId !== circleUserIdFromEmail(email)) throw new HttpError("You can only open your own wallet.", 403);
    return NextResponse.json(await circleCreateUserToken(userId));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
