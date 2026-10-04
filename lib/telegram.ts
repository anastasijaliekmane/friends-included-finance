import type { Expense, Sale } from "./types";
import { formatEuro } from "./domain";

export async function sendTelegramMessage(chatId: number, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is missing");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram ${response.status}`);
  return result;
}

export function saleDecisionMessage(sale: Sale) {
  const changed = sale.manager_changed ? "commission split changed" : "commission split approved";
  return [
    `Sale ${sale.reference} approved — ${changed}.`,
    `Sale ${formatEuro(sale.amount_cents)}; total commission ${formatEuro(sale.commission_pool_cents)}.`,
    `Richard: ${sale.proposed_richard_pct}% → ${sale.approved_richard_pct}% (${formatEuro(sale.richard_commission_cents)}).`,
    `Anastasia: ${sale.proposed_anastasia_pct}% → ${sale.approved_anastasia_pct}% (${formatEuro(sale.anastasia_commission_cents)}).`,
    `Jean-Claude: ${sale.proposed_jean_claude_pct}% → ${sale.approved_jean_claude_pct}% (${formatEuro(sale.jean_claude_commission_cents)}).`,
  ].join("\n");
}

export function expenseDecisionMessage(expense: Expense) {
  const changed = expense.manager_changed ? "allocation changed" : "allocation approved";
  return [
    `Expense ${expense.reference} — ${changed}.`,
    `${formatEuro(expense.amount_cents)}: ${expense.description}.`,
    `Proposed: ${expense.proposed_allocation}.`,
    `Approved: ${expense.final_allocation}.`,
  ].join("\n");
}
