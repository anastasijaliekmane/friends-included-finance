import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/domain";
import { createExpense } from "@/lib/transactions";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const expense = await createExpense({ actorEmployeeId: body.actorEmployeeId, origin: "website" }, body);
    return NextResponse.json({ expense }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
