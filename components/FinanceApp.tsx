"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { Allocation, Employee, Expense, FinanceSummary, Sale } from "@/lib/types";

type AppState = {
  actor: Employee;
  employees: Employee[];
  sales: Sale[];
  expenses: Expense[];
  links: { telegram_user_id: number; employee_id: string; chat_id: number; telegram_username: string | null }[];
  summary: FinanceSummary | null;
};

const employeesFallback: Employee[] = [
  { id: "svetlana", display_name: "Svetlana de Monte Carlo", role: "manager" },
  { id: "richard", display_name: "Richard “Call Me Dick” Darling", role: "salesperson" },
  { id: "anastasia", display_name: "Anastasia Ferrari", role: "salesperson" },
  { id: "jean-claude", display_name: "Jean-Claude Bērziņš", role: "salesperson" },
  { id: "kevin", display_name: "Kevin von Whatever", role: "expense_reporter" },
];

const euro = (cents: number) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(cents / 100);
const projectName = (code: string) => code === "A" ? "Respectable Relatives" : code === "B" ? "Drunk University Friends" : code;
const cls = (...items: (string | false | undefined)[]) => items.filter(Boolean).join(" ");

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

export default function FinanceApp() {
  const [employeeId, setEmployeeId] = useState("svetlana");
  const [data, setData] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api(`/api/state?employeeId=${encodeURIComponent(employeeId)}`));
      setNotice(null);
    } catch (error) {
      setData(null);
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load data" });
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    api(`/api/state?employeeId=${encodeURIComponent(employeeId)}`)
      .then((nextData) => {
        if (!cancelled) { setData(nextData); setNotice(null); }
      })
      .catch((error) => {
        if (!cancelled) { setData(null); setNotice({ tone: "error", text: error instanceof Error ? error.message : "Could not load data" }); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [employeeId]);
  const actor = data?.actor ?? employeesFallback.find((employee) => employee.id === employeeId)!;
  const employees = data?.employees.length ? data.employees : employeesFallback;
  const pendingCount = (data?.sales.filter((sale) => sale.status === "pending").length ?? 0) + (data?.expenses.filter((expense) => expense.status === "awaiting_allocation").length ?? 0);

  async function action(path: string, body: object, success: string) {
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      setNotice({ tone: "ok", text: success });
      await load();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Action failed" });
      throw error;
    }
  }

  const navigation = useMemo(() => {
    const items = [{ id: "overview", label: actor.role === "manager" ? "Dashboard" : "My activity" }];
    if (actor.role !== "manager") items.push({ id: "new", label: actor.role === "salesperson" ? "Report sale" : "Report expense" });
    if (actor.role === "manager") items.push({ id: "decisions", label: `Decisions${pendingCount ? ` (${pendingCount})` : ""}` }, { id: "setup", label: "Manager setup" });
    items.push({ id: "records", label: "Records" });
    return items;
  }, [actor.role, pendingCount]);

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brandmark">F</span><span>Friends Included <small>Finance</small></span></div>
        <label className="role-picker">
          <span>Demonstration role</span>
          <select value={employeeId} onChange={(event) => { setTab("overview"); setLoading(true); setEmployeeId(event.target.value); }}>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
          </select>
        </label>
      </header>

      <section className="shell">
        <aside className="sidebar">
          <div className="identity">
            <p className="eyebrow">Signed in for demonstration</p>
            <strong>{actor.display_name}</strong>
            <span>{actor.role.replace("_", " ")}</span>
            {process.env.NEXT_PUBLIC_OWNER_NAME && <p className="owner">Application by {process.env.NEXT_PUBLIC_OWNER_NAME}</p>}
          </div>
          <nav aria-label="Primary navigation">
            {navigation.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}
          </nav>
          <div className="sidebar-links">
            {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME && <a href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}`} target="_blank">Open Telegram bot</a>}
            {process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL && <a href={process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL} target="_blank">View Google Sheet</a>}
            {process.env.NEXT_PUBLIC_GITHUB_URL && <a href={process.env.NEXT_PUBLIC_GITHUB_URL} target="_blank">View source code</a>}
          </div>
        </aside>

        <section className="workspace">
          {notice && <div className={cls("notice", notice.tone)} role="status">{notice.text}</div>}
          {loading && <div className="loading">Updating records…</div>}
          {!loading && !data && <ConfigurationHelp />}
          {!loading && data && tab === "overview" && (actor.role === "manager" ? <Dashboard data={data} /> : <MyActivity data={data} actor={actor} setTab={setTab} />)}
          {!loading && data && tab === "new" && actor.role === "salesperson" && <SaleForm actor={actor} submit={action} />}
          {!loading && data && tab === "new" && actor.role === "expense_reporter" && <ExpenseForm actor={actor} submit={action} />}
          {!loading && data && tab === "decisions" && actor.role === "manager" && <Decisions data={data} action={action} />}
          {!loading && data && tab === "setup" && actor.role === "manager" && <ManagerSetup data={data} action={action} />}
          {!loading && data && tab === "records" && <Records data={data} actor={actor} action={action} />}
        </section>
      </section>
    </main>
  );
}

function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</div><div className="live"><span />Live from Supabase</div></div>;
}

function Dashboard({ data }: { data: AppState }) {
  const s = data.summary!;
  return <>
    <PageTitle eyebrow="Financial control" title="Company dashboard"><p>Approved work, commissions, and every recorded expense.</p></PageTitle>
    <div className="kpis">
      <Metric label="Approved income" value={euro(s.company.approvedIncomeCents)} />
      <Metric label="Commission expense" value={euro(s.company.commissionExpenseCents)} />
      <Metric label="Recorded expenses" value={euro(s.company.recordedExpenseCents)} />
      <Metric label="Company result" value={euro(s.company.resultCents)} strong />
    </div>
    <div className="project-grid">
      <ProjectCard code="A" name="Respectable Relatives" data={s.projectA} />
      <ProjectCard code="B" name="Drunk University Friends" data={s.projectB} />
    </div>
    <div className="detail-grid">
      <section className="panel"><div className="panel-head"><h2>Reconciliation</h2><span>Company</span></div>
        <dl className="statement">
          <div><dt>Combined project results</dt><dd>{euro(s.projectA.resultCents + s.projectB.resultCents)}</dd></div>
          <div><dt>Company overhead</dt><dd>−{euro(s.company.overheadCents)}</dd></div>
          <div><dt>Awaiting allocation</dt><dd>−{euro(s.company.awaitingAllocationCents)}</dd></div>
          <div className="total"><dt>Company result</dt><dd>{euro(s.company.resultCents)}</dd></div>
        </dl>
      </section>
      <section className="panel"><div className="panel-head"><h2>Commission earned</h2><span>Total {euro(s.commissions.total)}</span></div>
        <div className="commission-bars">
          {[["Richard", s.commissions.richard], ["Anastasia", s.commissions.anastasia], ["Jean-Claude", s.commissions.jeanClaude]].map(([name, value]) => {
            const amount = Number(value); const width = s.commissions.total ? Math.max(6, amount / s.commissions.total * 100) : 0;
            return <div key={String(name)}><div><span>{name}</span><strong>{euro(amount)}</strong></div><i><b style={{ width: `${width}%` }} /></i></div>;
          })}
        </div>
      </section>
    </div>
    <section className="panel attention"><div><p className="eyebrow">Needs Svetlana</p><h2>{data.sales.filter((s) => s.status === "pending").length} sales and {data.expenses.filter((e) => e.status === "awaiting_allocation").length} expenses await a decision</h2></div></section>
  </>;
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <article className={cls("metric", strong && "strong")}><span>{label}</span><b>{value}</b></article>;
}

function ProjectCard({ code, name, data }: { code: string; name: string; data: FinanceSummary["projectA"] }) {
  return <section className="project-card"><div className="project-head"><span>{code}</span><div><p>Project {code}</p><h2>{name}</h2></div></div>
    <dl className="statement"><div><dt>Approved income</dt><dd>{euro(data.approvedIncomeCents)}</dd></div><div><dt>Commissions</dt><dd>−{euro(data.commissionExpenseCents)}</dd></div><div><dt>Allocated expenses</dt><dd>−{euro(data.allocatedExpenseCents)}</dd></div><div className="total"><dt>Result</dt><dd>{euro(data.resultCents)}</dd></div></dl>
  </section>;
}

function MyActivity({ data, actor, setTab }: { data: AppState; actor: Employee; setTab: (tab: string) => void }) {
  const records = actor.role === "salesperson" ? data.sales : data.expenses;
  return <><PageTitle eyebrow="Personal workspace" title={`Welcome, ${actor.display_name.split(" ")[0]}`}><p>Your submissions and their current decision status.</p></PageTitle>
    <section className="panel empty-action"><div><h2>{records.length ? `${records.length} submission${records.length === 1 ? "" : "s"}` : "No submissions yet"}</h2><p>New records appear here after the database confirms the save.</p></div><button className="primary" onClick={() => setTab("new")}>Report {actor.role === "salesperson" ? "sale" : "expense"}</button></section>
    {actor.role === "salesperson" ? <SalesTable sales={data.sales} compact /> : <ExpensesTable expenses={data.expenses} compact />}
  </>;
}

function SaleForm({ actor, submit }: { actor: Employee; submit: (path: string, body: object, success: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try { await submit("/api/sales", { actorEmployeeId: actor.id, reference: form.get("reference"), customer: form.get("customer"), project: form.get("project"), description: form.get("description"), amount: form.get("amount"), richardPct: form.get("richardPct"), anastasiaPct: form.get("anastasiaPct"), jeanClaudePct: form.get("jeanClaudePct") }, "Sale saved as Pending approval"); event.currentTarget.reset(); } finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="Sales entry" title="Report a delivered sale"><p>The commission percentages divide a 10% pool and must total 100%.</p></PageTitle>
    <form className="form-panel" onSubmit={onSubmit}><div className="form-grid"><Field label="Unique reference"><input name="reference" required placeholder="S03" /></Field><Field label="Customer"><input name="customer" required placeholder="Emma Stonebridge" /></Field><Field label="Project"><select name="project"><option value="A">A — Respectable Relatives</option><option value="B">B — Drunk University Friends</option></select></Field><Field label="Amount in euros"><input name="amount" required type="number" min="0.01" step="0.01" placeholder="1500.00" /></Field><Field label="Description" wide><textarea name="description" required rows={3} placeholder="What was delivered" /></Field></div><fieldset><legend>Proposed commission split</legend><div className="triple"><Field label="Richard %"><input name="richardPct" type="number" min="0" max="100" defaultValue="40" required /></Field><Field label="Anastasia %"><input name="anastasiaPct" type="number" min="0" max="100" defaultValue="40" required /></Field><Field label="Jean-Claude %"><input name="jeanClaudePct" type="number" min="0" max="100" defaultValue="20" required /></Field></div></fieldset><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save sale"}</button></form>
  </>;
}

function ExpenseForm({ actor, submit }: { actor: Employee; submit: (path: string, body: object, success: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget);
    try { await submit("/api/expenses", { actorEmployeeId: actor.id, reference: form.get("reference"), description: form.get("description"), category: form.get("category"), amount: form.get("amount"), proposedAllocation: form.get("proposedAllocation") }, "Expense saved"); event.currentTarget.reset(); } finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="Expense entry" title="Report a paid expense"><p>Company overhead allocates immediately. Project expenses wait for Svetlana.</p></PageTitle>
    <form className="form-panel" onSubmit={onSubmit}><div className="form-grid"><Field label="Unique reference"><input name="reference" required placeholder="E04" /></Field><Field label="Amount in euros"><input name="amount" required type="number" min="0.01" step="0.01" placeholder="250.00" /></Field><Field label="Category"><select name="category"><option>Materials</option><option>Travel</option><option>Other</option></select></Field><Field label="Proposed allocation"><select name="proposedAllocation"><option value="A">A — Respectable Relatives</option><option value="B">B — Drunk University Friends</option><option>Company overhead</option></select></Field><Field label="Description" wide><textarea name="description" required rows={3} placeholder="What was purchased" /></Field></div><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save expense"}</button></form>
  </>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "wide" : ""}><span>{label}</span>{children}</label>; }

function Decisions({ data, action }: { data: AppState; action: (path: string, body: object, success: string) => Promise<void> }) {
  const pendingSales = data.sales.filter((sale) => sale.status === "pending"); const pendingExpenses = data.expenses.filter((expense) => expense.status === "awaiting_allocation");
  return <><PageTitle eyebrow="Manager decisions" title="Review proposals"><p>Approvals update the existing database and spreadsheet rows.</p></PageTitle>
    <h2 className="section-title">Sales pending approval <span>{pendingSales.length}</span></h2>{pendingSales.length ? <div className="decision-list">{pendingSales.map((sale) => <SaleDecision key={sale.id} sale={sale} action={action} />)}</div> : <Empty text="No sales are waiting." />}
    <h2 className="section-title">Expenses awaiting allocation <span>{pendingExpenses.length}</span></h2>{pendingExpenses.length ? <div className="decision-list">{pendingExpenses.map((expense) => <ExpenseDecision key={expense.id} expense={expense} action={action} />)}</div> : <Empty text="No expenses are waiting." />}
  </>;
}

function SaleDecision({ sale, action }: { sale: Sale; action: (path: string, body: object, success: string) => Promise<void> }) {
  const [r, setR] = useState(sale.proposed_richard_pct); const [a, setA] = useState(sale.proposed_anastasia_pct); const [j, setJ] = useState(sale.proposed_jean_claude_pct); const [busy, setBusy] = useState(false); const total = r + a + j;
  return <article className="decision-card"><div className="decision-summary"><div><span className="ref">{sale.reference}</span><span className="status pending">Pending approval</span></div><h3>{sale.customer}</h3><p>{sale.description}</p><div className="facts"><span>{projectName(sale.project)}</span><strong>{euro(sale.amount_cents)}</strong><span>Pool {euro(Math.round(sale.amount_cents * .1))}</span></div></div><div className="decision-controls"><p className="eyebrow">Final commission split</p><div className="triple compact"><Field label="Richard"><input type="number" min="0" max="100" value={r} onChange={(e) => setR(Number(e.target.value))} /></Field><Field label="Anastasia"><input type="number" min="0" max="100" value={a} onChange={(e) => setA(Number(e.target.value))} /></Field><Field label="Jean-Claude"><input type="number" min="0" max="100" value={j} onChange={(e) => setJ(Number(e.target.value))} /></Field></div><div className={cls("split-total", total === 100 && "valid")}>Total {total}%</div><button className="primary" disabled={busy || total !== 100} onClick={async () => { setBusy(true); try { await action(`/api/sales/${sale.id}/approve`, { actorEmployeeId: "svetlana", richardPct: r, anastasiaPct: a, jeanClaudePct: j }, `${sale.reference} approved`); } finally { setBusy(false); } }}>{busy ? "Approving…" : "Approve sale"}</button></div></article>;
}

function ExpenseDecision({ expense, action }: { expense: Expense; action: (path: string, body: object, success: string) => Promise<void> }) {
  const [allocation, setAllocation] = useState<Allocation>(expense.proposed_allocation); const [busy, setBusy] = useState(false);
  return <article className="decision-card"><div className="decision-summary"><div><span className="ref">{expense.reference}</span><span className="status pending">Awaiting allocation</span></div><h3>{expense.description}</h3><p>{expense.category} · proposed {projectName(expense.proposed_allocation)}</p><div className="facts"><strong>{euro(expense.amount_cents)}</strong></div></div><div className="decision-controls"><Field label="Final allocation"><select value={allocation} onChange={(e) => setAllocation(e.target.value as Allocation)}><option value="A">A — Respectable Relatives</option><option value="B">B — Drunk University Friends</option><option>Company overhead</option></select></Field><button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await action(`/api/expenses/${expense.id}/allocate`, { actorEmployeeId: "svetlana", finalAllocation: allocation }, `${expense.reference} allocated`); } finally { setBusy(false); } }}>{busy ? "Saving…" : "Confirm allocation"}</button></div></article>;
}

function ManagerSetup({ data, action }: { data: AppState; action: (path: string, body: object, success: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); try { await action("/api/telegram-links", { actorEmployeeId: "svetlana", telegramUserId: form.get("telegramUserId"), chatId: form.get("chatId"), telegramUsername: form.get("telegramUsername"), employeeId: form.get("employeeId") }, "Telegram user linked"); } finally { setBusy(false); } }
  return <><PageTitle eyebrow="Manager setup" title="Link Telegram identities"><p>The bot reports user and chat IDs after the person sends /start. Only this screen assigns fictional roles.</p></PageTitle><form className="form-panel" onSubmit={submit}><div className="form-grid"><Field label="Telegram user ID"><input required name="telegramUserId" inputMode="numeric" placeholder="123456789" /></Field><Field label="Telegram chat ID"><input required name="chatId" inputMode="numeric" placeholder="123456789" /></Field><Field label="Telegram username optional"><input name="telegramUsername" placeholder="username" /></Field><Field label="Employee"><select name="employeeId">{data.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}</select></Field></div><button className="primary" disabled={busy}>{busy ? "Linking…" : "Save link"}</button></form><section className="panel"><div className="panel-head"><h2>Current links</h2><span>{data.links.length}</span></div>{data.links.length ? <div className="link-list">{data.links.map((link) => <div key={link.telegram_user_id}><div><strong>{data.employees.find((employee) => employee.id === link.employee_id)?.display_name}</strong><span>@{link.telegram_username || "no username"}</span></div><code>{link.telegram_user_id} · chat {link.chat_id}</code></div>)}</div> : <Empty text="No Telegram identities are linked." />}</section></>;
}

function Records({ data, actor, action }: { data: AppState; actor: Employee; action: (path: string, body: object, success: string) => Promise<void> }) {
  return <><PageTitle eyebrow="Transaction register" title={actor.role === "manager" ? "All records" : "My records"}><p>Original proposals and final decisions remain visible.</p></PageTitle>{actor.role !== "expense_reporter" && <><h2 className="section-title">Sales <span>{data.sales.length}</span></h2><SalesTable sales={data.sales} manager={actor.role === "manager"} action={action} /></>}{actor.role !== "salesperson" && <><h2 className="section-title">Expenses <span>{data.expenses.length}</span></h2><ExpensesTable expenses={data.expenses} manager={actor.role === "manager"} action={action} /></>}</>;
}

function SalesTable({ sales, compact, manager, action }: { sales: Sale[]; compact?: boolean; manager?: boolean; action?: (path: string, body: object, success: string) => Promise<void> }) {
  if (!sales.length) return <Empty text="No sales to display." />;
  return <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Customer and project</th><th>Amount</th><th>Proposal</th>{!compact && <th>Approved</th>}<th>Status</th>{manager && <th>Integrations</th>}</tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><b>{sale.reference}</b><small>{new Date(sale.submitted_at).toLocaleDateString()}</small></td><td>{sale.customer}<small>{projectName(sale.project)}</small></td><td>{euro(sale.amount_cents)}</td><td>{sale.proposed_richard_pct} / {sale.proposed_anastasia_pct} / {sale.proposed_jean_claude_pct}%</td>{!compact && <td>{sale.status === "approved" ? `${sale.approved_richard_pct} / ${sale.approved_anastasia_pct} / ${sale.approved_jean_claude_pct}%` : "—"}</td>}<td><Status value={sale.status === "approved" ? "Approved" : "Pending"} /></td>{manager && <td><IntegrationActions kind="sale" record={sale} action={action!} /></td>}</tr>)}</tbody></table></div>;
}

function ExpensesTable({ expenses, compact, manager, action }: { expenses: Expense[]; compact?: boolean; manager?: boolean; action?: (path: string, body: object, success: string) => Promise<void> }) {
  if (!expenses.length) return <Empty text="No expenses to display." />;
  return <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Description</th><th>Amount</th><th>Proposal</th>{!compact && <th>Final</th>}<th>Status</th>{manager && <th>Integrations</th>}</tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td><b>{expense.reference}</b><small>{expense.category}</small></td><td>{expense.description}</td><td>{euro(expense.amount_cents)}</td><td>{projectName(expense.proposed_allocation)}</td>{!compact && <td>{expense.final_allocation ? projectName(expense.final_allocation) : "—"}</td>}<td><Status value={expense.status === "allocated" ? "Allocated" : "Awaiting"} /></td>{manager && <td><IntegrationActions kind="expense" record={expense} action={action!} /></td>}</tr>)}</tbody></table></div>;
}

function Status({ value }: { value: string }) { return <span className={cls("status", /approved|allocated/i.test(value) ? "approved" : "pending")}>{value}</span>; }

function IntegrationActions({ kind, record, action }: { kind: "sale" | "expense"; record: Sale | Expense; action: (path: string, body: object, success: string) => Promise<void> }) {
  return <div className="integration"><span className={record.sheet_sync_status}>{record.sheet_sync_status === "synced" ? "Sheets synced" : `Sheets ${record.sheet_sync_status}`}</span>{record.sheet_sync_status === "failed" && <button onClick={() => action("/api/retry", { actorEmployeeId: "svetlana", kind, id: record.id, target: "sheets" }, `${record.reference} synchronized`)}>Retry</button>}{record.notification_status !== "not_required" && <span className={record.notification_status}>{record.notification_status === "no_recipient" ? "No Telegram recipient" : `Telegram ${record.notification_status}`}</span>}{record.notification_status === "failed" && <button onClick={() => action("/api/retry", { actorEmployeeId: "svetlana", kind, id: record.id, target: "telegram" }, `${record.reference} notification sent`)}>Retry</button>}</div>;
}

function Empty({ text }: { text: string }) { return <div className="empty">{text}</div>; }
function ConfigurationHelp() { return <section className="configuration"><p className="eyebrow">One-time setup needed</p><h1>Connect the application services</h1><p>The interface is ready, but Supabase credentials are not available in this environment. Follow the README to create the database, add environment variables, and deploy to Vercel.</p><ol><li>Run <code>supabase/schema.sql</code> in Supabase.</li><li>Copy <code>.env.example</code> to <code>.env.local</code> and enter private values.</li><li>Restart the development server.</li></ol></section>; }
