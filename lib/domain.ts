import { z } from "zod";
import type { Expense, FinanceSummary, Sale } from "./types";

export const moneyToCents = (value: number) => Math.round(value * 100);
export const centsToMoney = (value: number) => value / 100;
export const formatEuro = (cents: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(centsToMoney(cents));

const reference = z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers, and hyphens only");
const positiveMoney = z.coerce.number().finite().gt(0).max(10000000);

export const saleInputSchema = z
  .object({
    reference,
    customer: z.string().trim().min(1).max(120),
    project: z.enum(["A", "B"]),
    description: z.string().trim().min(1).max(500),
    amount: positiveMoney,
    richardPct: z.coerce.number().int().min(0).max(100),
    anastasiaPct: z.coerce.number().int().min(0).max(100),
    jeanClaudePct: z.coerce.number().int().min(0).max(100),
  })
  .superRefine((value, ctx) => {
    if (value.richardPct + value.anastasiaPct + value.jeanClaudePct !== 100) {
      ctx.addIssue({ code: "custom", path: ["richardPct"], message: "Commission shares must total 100%" });
    }
  });

export const expenseInputSchema = z.object({
  reference,
  description: z.string().trim().min(1).max(500),
  category: z.enum(["Materials", "Travel", "Other"]),
  amount: positiveMoney,
  proposedAllocation: z.enum(["A", "B", "Company overhead"]),
});

export const splitSchema = z
  .object({
    richardPct: z.coerce.number().int().min(0).max(100),
    anastasiaPct: z.coerce.number().int().min(0).max(100),
    jeanClaudePct: z.coerce.number().int().min(0).max(100),
  })
  .superRefine((value, ctx) => {
    if (value.richardPct + value.anastasiaPct + value.jeanClaudePct !== 100) {
      ctx.addIssue({ code: "custom", message: "Commission shares must total 100%" });
    }
  });

export function calculateCommission(amountCents: number, split: { richardPct: number; anastasiaPct: number; jeanClaudePct: number }) {
  const poolCents = Math.round(amountCents * 0.1);
  const amounts = [
    Math.round((poolCents * split.richardPct) / 100),
    Math.round((poolCents * split.anastasiaPct) / 100),
    Math.round((poolCents * split.jeanClaudePct) / 100),
  ];
  const difference = poolCents - amounts.reduce((sum, item) => sum + item, 0);
  const shares = [split.richardPct, split.anastasiaPct, split.jeanClaudePct];
  const largest = Math.max(...shares);
  const recipientIndex = shares.findIndex((share) => share === largest);
  amounts[recipientIndex] += difference;
  return {
    poolCents,
    richardCents: amounts[0],
    anastasiaCents: amounts[1],
    jeanClaudeCents: amounts[2],
  };
}

export function calculateSummary(sales: Sale[], expenses: Expense[]): FinanceSummary {
  const approved = sales.filter((sale) => sale.status === "approved");
  const project = (code: "A" | "B") => {
    const matchingSales = approved.filter((sale) => sale.project === code);
    const approvedIncomeCents = matchingSales.reduce((sum, sale) => sum + sale.amount_cents, 0);
    const commissionExpenseCents = matchingSales.reduce((sum, sale) => sum + sale.commission_pool_cents, 0);
    const allocatedExpenseCents = expenses
      .filter((expense) => expense.final_allocation === code)
      .reduce((sum, expense) => sum + expense.amount_cents, 0);
    return {
      approvedIncomeCents,
      commissionExpenseCents,
      allocatedExpenseCents,
      resultCents: approvedIncomeCents - commissionExpenseCents - allocatedExpenseCents,
    };
  };
  const approvedIncomeCents = approved.reduce((sum, sale) => sum + sale.amount_cents, 0);
  const commissionExpenseCents = approved.reduce((sum, sale) => sum + sale.commission_pool_cents, 0);
  const recordedExpenseCents = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const overheadCents = expenses
    .filter((expense) => expense.final_allocation === "Company overhead")
    .reduce((sum, expense) => sum + expense.amount_cents, 0);
  const awaitingAllocationCents = expenses
    .filter((expense) => expense.status === "awaiting_allocation")
    .reduce((sum, expense) => sum + expense.amount_cents, 0);
  const richard = approved.reduce((sum, sale) => sum + sale.richard_commission_cents, 0);
  const anastasia = approved.reduce((sum, sale) => sum + sale.anastasia_commission_cents, 0);
  const jeanClaude = approved.reduce((sum, sale) => sum + sale.jean_claude_commission_cents, 0);
  return {
    projectA: project("A"),
    projectB: project("B"),
    company: {
      approvedIncomeCents,
      commissionExpenseCents,
      recordedExpenseCents,
      overheadCents,
      awaitingAllocationCents,
      resultCents: approvedIncomeCents - commissionExpenseCents - recordedExpenseCents,
    },
    commissions: { richard, anastasia, jeanClaude, total: richard + anastasia + jeanClaude },
  };
}

export function errorMessage(error: unknown) {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message).join("; ");
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
