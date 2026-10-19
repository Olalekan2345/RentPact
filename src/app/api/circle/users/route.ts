import { NextRequest, NextResponse } from "next/server";
import { circleCreateUser } from "@/lib/circleServer";
import { circleUserIdFromEmail } from "@/lib/circleUserId";
import { errorResponse, HttpError, requireUser } from "@/lib/sessionServer";

/** Creates the signed-in user's own Circle user — the id is derived from their session email, never chosen by the caller. */
export async function POST(req: NextRequest) {
  try {
    const { email } = await requireUser();
    const { userId } = await req.json();
    if (userId !== circleUserIdFromEmail(email)) throw new HttpError("You can only set up your own wallet.", 403);
    return NextResponse.json(await circleCreateUser(userId));
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
