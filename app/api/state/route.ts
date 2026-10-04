import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/domain";
import { getApplicationState } from "@/lib/transactions";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const employeeId = request.nextUrl.searchParams.get("employeeId") || "svetlana";
    return NextResponse.json(await getApplicationState(employeeId));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
