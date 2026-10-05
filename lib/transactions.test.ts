import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Employee, Expense, Sale } from "./types";

const serviceMocks = vi.hoisted(() => ({
  getEmployee: vi.fn(),
  getLinkedChat: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("./supabase", () => serviceMocks);
vi.mock("./sheets", () => ({ syncExpense: vi.fn(), syncSale: vi.fn() }));
vi.mock("./telegram", () => ({
  expenseDecisionMessage: vi.fn(),
  saleDecisionMessage: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

import { getApplicationState } from "./transactions";

const submittedAt = "2026-10-05T00:00:00.000Z";

const employees: Employee[] = [
  { id: "richard", display_name: "Richard Darling", role: "salesperson" },
  { id: "anastasia", display_name: "Anastasia Ferrari", role: "salesperson" },
  { id: "jean-claude", display_name: "Jean-Claude Bērziņš", role: "salesperson" },
  { id: "kevin", display_name: "Kevin von Whatever", role: "expense_reporter" },
  { id: "svetlana", display_name: "Svetlana de Monte Carlo", role: "manager" },
];

function sale(overrides: Partial<Sale> & Pick<Sale, "id" | "reference" | "submitter_employee_id">): Sale {
  return {
    submitted_at: submittedAt,
    origin: "website",
    notification_chat_id: null,
    customer: "Customer",
    project: "A",
    description: "Delivered service",
    amount_cents: 100000,
    proposed_richard_pct: 50,
    proposed_anastasia_pct: 30,
    proposed_jean_claude_pct: 20,
    approved_richard_pct: 50,
    approved_anastasia_pct: 30,
    approved_jean_claude_pct: 20,
    commission_pool_cents: 10000,
    richard_commission_cents: 5000,
    anastasia_commission_cents: 3000,
    jean_claude_commission_cents: 2000,
    status: "approved",
    manager_changed: false,
    approved_by: "svetlana",
    approved_at: submittedAt,
    sheet_sync_status: "synced",
    sheet_sync_error: null,
    notification_status: "sent",
    notification_error: null,
    ...overrides,
  };
}

function expense(overrides: Partial<Expense> & Pick<Expense, "id" | "reference">): Expense {
  return {
    submitted_at: submittedAt,
    reporter_employee_id: "kevin",
    origin: "website",
    notification_chat_id: null,
    description: "Recorded expense",
    category: "Other",
    amount_cents: 10000,
    proposed_allocation: "Company overhead",
    final_allocation: "Company overhead",
    status: "allocated",
    manager_changed: false,
    approved_by: null,
    approved_at: null,
    sheet_sync_status: "synced",
    sheet_sync_error: null,
    notification_status: "not_required",
    notification_error: null,
    ...overrides,
  };
}

const sales: Sale[] = [
  sale({ id: "s01", reference: "S01", submitter_employee_id: "richard", amount_cents: 100000, project: "A", commission_pool_cents: 10000, richard_commission_cents: 5000, anastasia_commission_cents: 3000, jean_claude_commission_cents: 2000 }),
  sale({ id: "s02", reference: "S02", submitter_employee_id: "anastasia", amount_cents: 200000, project: "B", commission_pool_cents: 20000, richard_commission_cents: 4000, anastasia_commission_cents: 8000, jean_claude_commission_cents: 8000 }),
  sale({ id: "s03", reference: "S03", submitter_employee_id: "jean-claude", amount_cents: 150000, project: "A", commission_pool_cents: 15000, richard_commission_cents: 3000, anastasia_commission_cents: 4500, jean_claude_commission_cents: 7500 }),
  sale({ id: "s04", reference: "S04", submitter_employee_id: "richard", amount_cents: 80000, project: "B", commission_pool_cents: 8000, richard_commission_cents: 2000, anastasia_commission_cents: 2000, jean_claude_commission_cents: 4000 }),
  sale({ id: "s05", reference: "S05", submitter_employee_id: "richard", amount_cents: 60000, project: "B", status: "pending", approved_richard_pct: null, approved_anastasia_pct: null, approved_jean_claude_pct: null, commission_pool_cents: 0, richard_commission_cents: 0, anastasia_commission_cents: 0, jean_claude_commission_cents: 0 }),
  sale({ id: "s100528", reference: "S100528", submitter_employee_id: "richard", amount_cents: 1000, project: "A", approved_richard_pct: 20, approved_anastasia_pct: 30, approved_jean_claude_pct: 50, commission_pool_cents: 100, richard_commission_cents: 20, anastasia_commission_cents: 30, jean_claude_commission_cents: 50, manager_changed: true }),
];

const expenses: Expense[] = [
  expense({ id: "e01", reference: "E01", amount_cents: 12000, proposed_allocation: "A", final_allocation: "A" }),
  expense({ id: "e02", reference: "E02", amount_cents: 8000, proposed_allocation: "B", final_allocation: "A", manager_changed: true }),
  expense({ id: "e03", reference: "E03", amount_cents: 10000 }),
  expense({ id: "e04", reference: "E04", amount_cents: 25000, proposed_allocation: "B", final_allocation: "B" }),
  expense({ id: "e05", reference: "E05", amount_cents: 9000, proposed_allocation: "A", final_allocation: "B", manager_changed: true }),
  expense({ id: "e06", reference: "E06", amount_cents: 6000 }),
  expense({ id: "e07", reference: "E07", amount_cents: 14000, proposed_allocation: "A", final_allocation: null, status: "awaiting_allocation" }),
  expense({ id: "e100528", reference: "E100528", amount_cents: 300, proposed_allocation: "A", final_allocation: "B", manager_changed: true }),
];

const links = [{ telegram_user_id: 1, employee_id: "kevin", chat_id: 1, telegram_username: "reviewer", linked_at: submittedAt }];

type Row = object;

function queryFor(sourceRows: Row[]) {
  let rows = [...sourceRows];
  const query = {
    order: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      rows = rows.filter((row) => (row as Record<string, unknown>)[column] === value);
      return query;
    }),
    then: (
      resolve: (result: { data: Row[]; error: null }) => unknown,
      reject?: (error: unknown) => unknown,
    ) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return query;
}

let fromMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.getEmployee.mockImplementation(async (employeeId: string) => {
    const employee = employees.find((candidate) => candidate.id === employeeId);
    if (!employee) throw new Error("Employee not found");
    return employee;
  });
  const tables: Record<string, Row[]> = { employees, sales, expenses, telegram_links: links };
  fromMock = vi.fn((table: string) => ({
    select: vi.fn(() => queryFor(tables[table] ?? [])),
  }));
  serviceMocks.getSupabaseAdmin.mockReturnValue({ from: fromMock });
});

describe("application-state privacy", () => {
  it.each([
    ["richard", ["S01", "S04", "S05", "S100528"]],
    ["anastasia", ["S02"]],
    ["jean-claude", ["S03"]],
  ])("returns only %s's sales and no financial summary", async (employeeId, expectedReferences) => {
    const state = await getApplicationState(employeeId);

    expect(state.sales.map((item) => item.reference)).toEqual(expectedReferences);
    expect(state.expenses).toEqual([]);
    expect(state.links).toEqual([]);
    expect(state.summary).toBeNull();
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual(["employees", "sales", "expenses"]);
  });

  it("returns only Kevin's expenses and no financial summary", async () => {
    const state = await getApplicationState("kevin");

    expect(state.sales).toEqual([]);
    expect(state.expenses.map((item) => item.reference)).toEqual(expenses.map((item) => item.reference));
    expect(state.links).toEqual([]);
    expect(state.summary).toBeNull();
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual(["employees", "sales", "expenses"]);
  });

  it("keeps all records, links, and financial results in Svetlana's manager view", async () => {
    const state = await getApplicationState("svetlana");

    expect(state.sales).toHaveLength(sales.length);
    expect(state.expenses).toHaveLength(expenses.length);
    expect(state.links).toEqual(links);
    expect(state.sales.find((item) => item.reference === "S05")?.status).toBe("pending");
    expect(state.expenses.find((item) => item.reference === "E07")?.status).toBe("awaiting_allocation");
    expect(state.summary?.projectA.resultCents).toBe(205900);
    expect(state.summary?.projectB.resultCents).toBe(217700);
    expect(state.summary?.company.resultCents).toBe(393600);
    expect(state.summary?.commissions).toEqual({ richard: 14020, anastasia: 17530, jeanClaude: 21550, total: 53100 });
    expect(fromMock.mock.calls.map(([table]) => table)).toEqual(["employees", "sales", "expenses", "telegram_links"]);
  });
});
