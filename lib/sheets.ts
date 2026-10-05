import { GoogleAuth } from "google-auth-library";
import type { Expense, Sale } from "./types";
import { formatEuro } from "./domain";

const SALES_HEADERS = [
  "Reference", "Submission time", "Salesperson", "Customer", "Project", "Description", "Amount",
  "Proposed Richard %", "Proposed Anastasia %", "Proposed Jean-Claude %",
  "Approved Richard %", "Approved Anastasia %", "Approved Jean-Claude %",
  "Richard earned", "Anastasia earned", "Jean-Claude earned", "Total commission",
  "Status", "Origin", "Sheet sync"
];
const EXPENSE_HEADERS = [
  "Reference", "Submission time", "Reporter", "Description", "Category", "Amount",
  "Proposed allocation", "Final allocation", "Status", "Origin", "Sheet sync"
];

export function parseGoogleCredentials(raw: string) {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (typeof parsed.private_key === "string") {
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  }
  return parsed;
}

function credentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Google Sheets is not configured");
  return parseGoogleCredentials(raw);
}

async function sheetsRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = new GoogleAuth({ credentials: credentials(), scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Google Sheets ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function upsert(tab: "Sales" | "Expenses", headers: string[], reference: string, row: (string | number)[]) {
  if (!process.env.GOOGLE_SHEET_ID) throw new Error("GOOGLE_SHEET_ID is missing");
  const range = encodeURIComponent(`${tab}!A:Z`);
  const existing = await sheetsRequest<{ values?: (string | number)[][] }>(`/values/${range}`);
  if (!existing.values?.length) {
    await sheetsRequest(`/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ range: `${tab}!A1`, majorDimension: "ROWS", values: [headers] }),
    });
  }
  const values = existing.values ?? [];
  const index = values.findIndex((existingRow, rowIndex) => rowIndex > 0 && String(existingRow[0]) === reference);
  const rowNumber = index >= 0 ? index + 1 : Math.max(values.length + 1, 2);
  await sheetsRequest(`/values/${encodeURIComponent(`${tab}!A${rowNumber}`)}?valueInputOption=USER_ENTERED`, {
    method: "PUT", body: JSON.stringify({ range: `${tab}!A${rowNumber}`, majorDimension: "ROWS", values: [row] }),
  });
}

export async function syncSale(sale: Sale, employeeName: string) {
  await upsert("Sales", SALES_HEADERS, sale.reference, [
    sale.reference, sale.submitted_at, employeeName, sale.customer, sale.project, sale.description, formatEuro(sale.amount_cents),
    sale.proposed_richard_pct, sale.proposed_anastasia_pct, sale.proposed_jean_claude_pct,
    sale.approved_richard_pct ?? "", sale.approved_anastasia_pct ?? "", sale.approved_jean_claude_pct ?? "",
    formatEuro(sale.richard_commission_cents), formatEuro(sale.anastasia_commission_cents), formatEuro(sale.jean_claude_commission_cents),
    formatEuro(sale.commission_pool_cents), sale.status === "approved" ? "Approved" : "Pending approval", sale.origin, "Synced"
  ]);
}

export async function syncExpense(expense: Expense, employeeName: string) {
  await upsert("Expenses", EXPENSE_HEADERS, expense.reference, [
    expense.reference, expense.submitted_at, employeeName, expense.description, expense.category, formatEuro(expense.amount_cents),
    expense.proposed_allocation, expense.final_allocation ?? "", expense.status === "allocated" ? "Allocated" : "Awaiting allocation",
    expense.origin, "Synced"
  ]);
}
