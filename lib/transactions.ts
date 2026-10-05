import { calculateCommission, calculateSummary, expenseInputSchema, moneyToCents, saleInputSchema, splitSchema } from "./domain";
import { getEmployee, getLinkedChat, getSupabaseAdmin } from "./supabase";
import { syncExpense, syncSale } from "./sheets";
import { expenseDecisionMessage, saleDecisionMessage, sendTelegramMessage } from "./telegram";
import type { Allocation, Expense, Origin, Sale } from "./types";

type ActorContext = { actorEmployeeId: string; origin: Origin; telegramChatId?: number };

function duplicateMessage(error: { code?: string; message?: string } | null) {
  if (error?.code === "23505") return "That reference already exists";
  return error?.message || "Could not save the transaction";
}

async function snapshotChat(context: ActorContext) {
  return context.origin === "telegram" ? context.telegramChatId ?? null : getLinkedChat(context.actorEmployeeId);
}

export async function createSale(context: ActorContext, rawInput: unknown) {
  const actor = await getEmployee(context.actorEmployeeId);
  if (actor.role !== "salesperson") throw new Error("Only a salesperson can submit a sale");
  const input = saleInputSchema.parse(rawInput);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("sales").insert({
    reference: input.reference.toUpperCase(),
    submitter_employee_id: actor.id,
    origin: context.origin,
    notification_chat_id: await snapshotChat(context),
    customer: input.customer,
    project: input.project,
    description: input.description,
    amount_cents: moneyToCents(input.amount),
    proposed_richard_pct: input.richardPct,
    proposed_anastasia_pct: input.anastasiaPct,
    proposed_jean_claude_pct: input.jeanClaudePct,
    status: "pending",
  }).select("*").single();
  if (error || !data) throw new Error(duplicateMessage(error));
  return syncSaleRecord(data as Sale);
}

export async function createExpense(context: ActorContext, rawInput: unknown) {
  const actor = await getEmployee(context.actorEmployeeId);
  if (actor.role !== "expense_reporter") throw new Error("Only Kevin can submit an expense");
  const input = expenseInputSchema.parse(rawInput);
  const isOverhead = input.proposedAllocation === "Company overhead";
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("expenses").insert({
    reference: input.reference.toUpperCase(),
    reporter_employee_id: actor.id,
    origin: context.origin,
    notification_chat_id: await snapshotChat(context),
    description: input.description,
    category: input.category,
    amount_cents: moneyToCents(input.amount),
    proposed_allocation: input.proposedAllocation,
    final_allocation: isOverhead ? "Company overhead" : null,
    status: isOverhead ? "allocated" : "awaiting_allocation",
  }).select("*").single();
  if (error || !data) throw new Error(duplicateMessage(error));
  return syncExpenseRecord(data as Expense);
}

export async function syncSaleRecord(sale: Sale) {
  const supabase = getSupabaseAdmin();
  const employee = await getEmployee(sale.submitter_employee_id);
  try {
    await syncSale(sale, employee.display_name);
    await supabase.from("sales").update({ sheet_sync_status: "synced", sheet_sync_error: null }).eq("id", sale.id);
    return { ...sale, sheet_sync_status: "synced", sheet_sync_error: null } as Sale;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Sheets error";
    await supabase.from("sales").update({ sheet_sync_status: "failed", sheet_sync_error: message }).eq("id", sale.id);
    return { ...sale, sheet_sync_status: "failed", sheet_sync_error: message } as Sale;
  }
}

export async function syncExpenseRecord(expense: Expense) {
  const supabase = getSupabaseAdmin();
  const employee = await getEmployee(expense.reporter_employee_id);
  try {
    await syncExpense(expense, employee.display_name);
    await supabase.from("expenses").update({ sheet_sync_status: "synced", sheet_sync_error: null }).eq("id", expense.id);
    return { ...expense, sheet_sync_status: "synced", sheet_sync_error: null } as Expense;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Sheets error";
    await supabase.from("expenses").update({ sheet_sync_status: "failed", sheet_sync_error: message }).eq("id", expense.id);
    return { ...expense, sheet_sync_status: "failed", sheet_sync_error: message } as Expense;
  }
}

export async function approveSale(actorEmployeeId: string, saleId: string, rawSplit: unknown) {
  const actor = await getEmployee(actorEmployeeId);
  if (actor.role !== "manager") throw new Error("Only Svetlana can approve a sale");
  const split = splitSchema.parse(rawSplit);
  const supabase = getSupabaseAdmin();
  const { data: current, error: findError } = await supabase.from("sales").select("*").eq("id", saleId).single();
  if (findError || !current) throw new Error("Sale not found");
  if (current.status === "approved") return { sale: current as Sale, alreadyApproved: true };
  const commissions = calculateCommission(current.amount_cents, split);
  const changed = current.proposed_richard_pct !== split.richardPct || current.proposed_anastasia_pct !== split.anastasiaPct || current.proposed_jean_claude_pct !== split.jeanClaudePct;
  const { data, error } = await supabase.from("sales").update({
    approved_richard_pct: split.richardPct,
    approved_anastasia_pct: split.anastasiaPct,
    approved_jean_claude_pct: split.jeanClaudePct,
    commission_pool_cents: commissions.poolCents,
    richard_commission_cents: commissions.richardCents,
    anastasia_commission_cents: commissions.anastasiaCents,
    jean_claude_commission_cents: commissions.jeanClaudeCents,
    status: "approved",
    manager_changed: changed,
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
    sheet_sync_status: "pending",
    notification_status: current.notification_chat_id ? "pending" : "no_recipient",
    notification_error: current.notification_chat_id ? null : "No Telegram recipient linked",
  }).eq("id", saleId).eq("status", "pending").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { data: completed } = await supabase.from("sales").select("*").eq("id", saleId).single();
    return { sale: completed as Sale, alreadyApproved: true };
  }
  const synced = await syncSaleRecord(data as Sale);
  const notified = await deliverSaleDecision(synced);
  return { sale: notified, alreadyApproved: false };
}

export async function allocateExpense(actorEmployeeId: string, expenseId: string, finalAllocation: Allocation) {
  const actor = await getEmployee(actorEmployeeId);
  if (actor.role !== "manager") throw new Error("Only Svetlana can allocate an expense");
  if (!(["A", "B", "Company overhead"] as string[]).includes(finalAllocation)) throw new Error("Invalid allocation");
  const supabase = getSupabaseAdmin();
  const { data: current, error: findError } = await supabase.from("expenses").select("*").eq("id", expenseId).single();
  if (findError || !current) throw new Error("Expense not found");
  if (current.status === "allocated") return { expense: current as Expense, alreadyAllocated: true };
  const { data, error } = await supabase.from("expenses").update({
    final_allocation: finalAllocation,
    status: "allocated",
    manager_changed: current.proposed_allocation !== finalAllocation,
    approved_by: actor.id,
    approved_at: new Date().toISOString(),
    sheet_sync_status: "pending",
    notification_status: current.notification_chat_id ? "pending" : "no_recipient",
    notification_error: current.notification_chat_id ? null : "No Telegram recipient linked",
  }).eq("id", expenseId).eq("status", "awaiting_allocation").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const { data: completed } = await supabase.from("expenses").select("*").eq("id", expenseId).single();
    return { expense: completed as Expense, alreadyAllocated: true };
  }
  const synced = await syncExpenseRecord(data as Expense);
  const notified = await deliverExpenseDecision(synced);
  return { expense: notified, alreadyAllocated: false };
}

export async function deliverSaleDecision(sale: Sale) {
  if (!sale.notification_chat_id) return sale;
  const supabase = getSupabaseAdmin();
  try {
    await sendTelegramMessage(sale.notification_chat_id, saleDecisionMessage(sale));
    await supabase.from("sales").update({ notification_status: "sent", notification_error: null }).eq("id", sale.id);
    return { ...sale, notification_status: "sent", notification_error: null } as Sale;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram error";
    await supabase.from("sales").update({ notification_status: "failed", notification_error: message }).eq("id", sale.id);
    return { ...sale, notification_status: "failed", notification_error: message } as Sale;
  }
}

export async function deliverExpenseDecision(expense: Expense) {
  if (!expense.notification_chat_id) return expense;
  const supabase = getSupabaseAdmin();
  try {
    await sendTelegramMessage(expense.notification_chat_id, expenseDecisionMessage(expense));
    await supabase.from("expenses").update({ notification_status: "sent", notification_error: null }).eq("id", expense.id);
    return { ...expense, notification_status: "sent", notification_error: null } as Expense;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Telegram error";
    await supabase.from("expenses").update({ notification_status: "failed", notification_error: message }).eq("id", expense.id);
    return { ...expense, notification_status: "failed", notification_error: message } as Expense;
  }
}

export async function getApplicationState(actorEmployeeId: string) {
  const actor = await getEmployee(actorEmployeeId);
  const supabase = getSupabaseAdmin();
  const employeesResult = await supabase.from("employees").select("*").order("display_name");
  let salesQuery = supabase.from("sales").select("*").order("submitted_at", { ascending: false });
  let expensesQuery = supabase.from("expenses").select("*").order("submitted_at", { ascending: false });
  if (actor.role === "salesperson") {
    salesQuery = salesQuery.eq("submitter_employee_id", actor.id);
    expensesQuery = expensesQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (actor.role === "expense_reporter") {
    salesQuery = salesQuery.eq("id", "00000000-0000-0000-0000-000000000000");
    expensesQuery = expensesQuery.eq("reporter_employee_id", actor.id);
  }
  const [salesResult, expensesResult, linksResult] = await Promise.all([
    salesQuery,
    expensesQuery,
    actor.role === "manager" ? supabase.from("telegram_links").select("*").order("linked_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const error = employeesResult.error || salesResult.error || expensesResult.error;
  if (error) throw new Error(error.message);
  const sales = (salesResult.data ?? []) as Sale[];
  const expenses = (expensesResult.data ?? []) as Expense[];
  let summary = calculateSummary(sales, expenses);
  if (actor.role !== "manager") {
    const [allSalesResult, allExpensesResult] = await Promise.all([
      supabase.from("sales").select("*"),
      supabase.from("expenses").select("*"),
    ]);
    const summaryError = allSalesResult.error || allExpensesResult.error;
    if (summaryError) throw new Error(summaryError.message);
    summary = calculateSummary(
      (allSalesResult.data ?? []) as Sale[],
      (allExpensesResult.data ?? []) as Expense[],
    );
  }
  return {
    actor,
    employees: employeesResult.data ?? [],
    sales,
    expenses,
    links: linksResult.data ?? [],
    summary,
  };
}
