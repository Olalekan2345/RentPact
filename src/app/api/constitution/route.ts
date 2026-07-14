import { NextResponse } from "next/server";
import { getConstitution } from "@/lib/constitutionServer";

export async function GET() {
  const constitution = await getConstitution();
  return NextResponse.json(constitution);
}
