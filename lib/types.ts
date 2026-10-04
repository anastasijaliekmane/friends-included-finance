export type EmployeeRole = "manager" | "salesperson" | "expense_reporter";
export type ProjectCode = "A" | "B";
export type Allocation = ProjectCode | "Company overhead";
export type Origin = "website" | "telegram";
export type SyncStatus = "pending" | "synced" | "failed";
export type DeliveryStatus = "not_required" | "pending" | "sent" | "failed" | "no_recipient";

export interface Employee {
  id: string;
  display_name: string;
  role: EmployeeRole;
}

export interface Sale {
  id: string;
  reference: string;
  submitted_at: string;
  submitter_employee_id: string;
  origin: Origin;
  notification_chat_id: number | null;
  customer: string;
  project: ProjectCode;
  description: string;
  amount_cents: number;
  proposed_richard_pct: number;
  proposed_anastasia_pct: number;
  proposed_jean_claude_pct: number;
  approved_richard_pct: number | null;
  approved_anastasia_pct: number | null;
  approved_jean_claude_pct: number | null;
  commission_pool_cents: number;
  richard_commission_cents: number;
  anastasia_commission_cents: number;
  jean_claude_commission_cents: number;
  status: "pending" | "approved";
  manager_changed: boolean;
  approved_by: string | null;
  approved_at: string | null;
  sheet_sync_status: SyncStatus;
  sheet_sync_error: string | null;
  notification_status: DeliveryStatus;
  notification_error: string | null;
}

export interface Expense {
  id: string;
  reference: string;
  submitted_at: string;
  reporter_employee_id: string;
  origin: Origin;
  notification_chat_id: number | null;
  description: string;
  category: "Materials" | "Travel" | "Other";
  amount_cents: number;
  proposed_allocation: Allocation;
  final_allocation: Allocation | null;
  status: "awaiting_allocation" | "allocated";
  manager_changed: boolean;
  approved_by: string | null;
  approved_at: string | null;
  sheet_sync_status: SyncStatus;
  sheet_sync_error: string | null;
  notification_status: DeliveryStatus;
  notification_error: string | null;
}

export interface FinanceSummary {
  projectA: ProjectSummary;
  projectB: ProjectSummary;
  company: {
    approvedIncomeCents: number;
    commissionExpenseCents: number;
    recordedExpenseCents: number;
    overheadCents: number;
    awaitingAllocationCents: number;
    resultCents: number;
  };
  commissions: { richard: number; anastasia: number; jeanClaude: number; total: number };
}

export interface ProjectSummary {
  approvedIncomeCents: number;
  commissionExpenseCents: number;
  allocatedExpenseCents: number;
  resultCents: number;
}
