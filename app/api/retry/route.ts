import { NextRequest, NextResponse } from "next/server";
import { errorMessage } from "@/lib/domain";
import { getEmployee, getSupabaseAdmin } from "@/lib/supabase";
import { deliverExpenseDecision, deliverSaleDecision, syncExpenseRecord, syncSaleRecord } from "@/lib/transactions";
import type { Expense, Sale } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const actor = await getEmployee(body.actorEmployeeId);
    if (actor.role !== "manager") throw new Error("Only Svetlana can retry integrations");
    const table = body.kind === "sale" ? "sales" : body.kind === "expense" ? "expenses" : null;
    if (!table) throw new Error("Invalid transaction kind");
    const { data, error } = await getSupabaseAdmin().from(table).select("*").eq("id", body.id).single();
    if (error || !data) throw new Error("Transaction not found");
    if (body.target === "sheets") {
      const record = table === "sales" ? await syncSaleRecord(data as Sale) : await syncExpenseRecord(data as Expense);
      return NextResponse.json({ record });
    }
    if (body.target === "telegram") {
      if (data.status !== "approved" && data.status !== "allocated") throw new Error("Decision is not complete");
      const record = table === "sales" ? await deliverSaleDecision(data as Sale) : await deliverExpenseDecision(data as Expense);
      return NextResponse.json({ record });
    }
    throw new Error("Invalid retry target");
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
}
