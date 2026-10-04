import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/domain";
import { createSale } from "@/lib/transactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sale = await createSale({ actorEmployeeId: body.actorEmployeeId, origin: "website" }, body);
    return NextResponse.json({ sale }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
