import { describe, expect, it } from "vitest";
import { calculateCommission, calculateSummary, expenseInputSchema, saleInputSchema } from "./domain";
import type { Expense, Sale } from "./types";

const baseSale = (overrides: Partial<Sale>): Sale => ({
  id: crypto.randomUUID(), reference: "S", submitted_at: new Date().toISOString(), submitter_employee_id: "richard", origin: "website",
  notification_chat_id: null, customer: "Customer", project: "A", description: "Work", amount_cents: 100000,
  proposed_richard_pct: 50, proposed_anastasia_pct: 30, proposed_jean_claude_pct: 20,
  approved_richard_pct: 50, approved_anastasia_pct: 30, approved_jean_claude_pct: 20,
  commission_pool_cents: 10000, richard_commission_cents: 5000, anastasia_commission_cents: 3000, jean_claude_commission_cents: 2000,
  status: "approved", manager_changed: false, approved_by: "svetlana", approved_at: new Date().toISOString(),
  sheet_sync_status: "synced", sheet_sync_error: null, notification_status: "not_required", notification_error: null, ...overrides,
});
const baseExpense = (overrides: Partial<Expense>): Expense => ({
  id: crypto.randomUUID(), reference: "E", submitted_at: new Date().toISOString(), reporter_employee_id: "kevin", origin: "website",
  notification_chat_id: null, description: "Expense", category: "Other", amount_cents: 10000, proposed_allocation: "Company overhead",
  final_allocation: "Company overhead", status: "allocated", manager_changed: false, approved_by: null, approved_at: null,
  sheet_sync_status: "synced", sheet_sync_error: null, notification_status: "not_required", notification_error: null, ...overrides,
});

describe("business rules", () => {
  it("refuses commission shares that do not total 100", () => {
    expect(() => saleInputSchema.parse({ reference: "S99", customer: "A", project: "A", description: "A", amount: 10, richardPct: 60, anastasiaPct: 30, jeanClaudePct: 20 })).toThrow(/total 100/);
  });

  it("refuses zero expenses", () => {
    expect(() => expenseInputSchema.parse({ reference: "E99", description: "A", category: "Other", amount: 0, proposedAllocation: "A" })).toThrow();
  });

  it("gives a rounding difference to the largest share with required tie priority", () => {
    const result = calculateCommission(101, { richardPct: 34, anastasiaPct: 33, jeanClaudePct: 33 });
    expect(result).toEqual({ poolCents: 10, richardCents: 4, anastasiaCents: 3, jeanClaudeCents: 3 });
  });

  it("matches the cumulative Test 2 control totals", () => {
    const sales = [
      baseSale({ reference: "S01", amount_cents: 100000, project: "A", commission_pool_cents: 10000, richard_commission_cents: 5000, anastasia_commission_cents: 3000, jean_claude_commission_cents: 2000 }),
      baseSale({ reference: "S02", amount_cents: 200000, project: "B", commission_pool_cents: 20000, richard_commission_cents: 4000, anastasia_commission_cents: 8000, jean_claude_commission_cents: 8000 }),
      baseSale({ reference: "S03", amount_cents: 150000, project: "A", commission_pool_cents: 15000, richard_commission_cents: 3000, anastasia_commission_cents: 4500, jean_claude_commission_cents: 7500 }),
      baseSale({ reference: "S04", amount_cents: 80000, project: "B", commission_pool_cents: 8000, richard_commission_cents: 2000, anastasia_commission_cents: 2000, jean_claude_commission_cents: 4000 }),
      baseSale({ reference: "S05", amount_cents: 60000, project: "B", status: "pending", approved_richard_pct: null, approved_anastasia_pct: null, approved_jean_claude_pct: null, commission_pool_cents: 0, richard_commission_cents: 0, anastasia_commission_cents: 0, jean_claude_commission_cents: 0 }),
    ];
    const expenses = [
      baseExpense({ reference: "E01", amount_cents: 12000, proposed_allocation: "A", final_allocation: "A" }),
      baseExpense({ reference: "E02", amount_cents: 8000, proposed_allocation: "B", final_allocation: "A", manager_changed: true }),
      baseExpense({ reference: "E03", amount_cents: 10000 }),
      baseExpense({ reference: "E04", amount_cents: 25000, proposed_allocation: "B", final_allocation: "B" }),
      baseExpense({ reference: "E05", amount_cents: 9000, proposed_allocation: "A", final_allocation: "B", manager_changed: true }),
      baseExpense({ reference: "E06", amount_cents: 6000 }),
      baseExpense({ reference: "E07", amount_cents: 14000, proposed_allocation: "A", final_allocation: null, status: "awaiting_allocation" }),
    ];
    const summary = calculateSummary(sales, expenses);
    expect(summary.projectA.resultCents).toBe(205000);
    expect(summary.projectB.resultCents).toBe(218000);
    expect(summary.company.resultCents).toBe(393000);
    expect(summary.commissions).toEqual({ richard: 14000, anastasia: 17500, jeanClaude: 21500, total: 53000 });
  });
});
