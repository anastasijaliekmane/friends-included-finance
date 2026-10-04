import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/domain";
import { approveSale } from "@/lib/transactions";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const { id } = await context.params;
    return NextResponse.json(await approveSale(body.actorEmployeeId, id, body));
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
