begin;

create extension if not exists pgcrypto;

create table if not exists public.employees (
  id text primary key,
  display_name text not null,
  role text not null check (role in ('manager', 'salesperson', 'expense_reporter'))
);

insert into public.employees (id, display_name, role) values
  ('svetlana', 'Svetlana de Monte Carlo', 'manager'),
  ('richard', 'Richard “Call Me Dick” Darling', 'salesperson'),
  ('anastasia', 'Anastasia Ferrari', 'salesperson'),
  ('jean-claude', 'Jean-Claude Bērziņš', 'salesperson'),
  ('kevin', 'Kevin von Whatever', 'expense_reporter')
on conflict (id) do update set display_name = excluded.display_name, role = excluded.role;

create table if not exists public.telegram_links (
  telegram_user_id bigint primary key,
  employee_id text not null unique references public.employees(id),
  chat_id bigint not null,
  telegram_username text,
  linked_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  submitted_at timestamptz not null default now(),
  submitter_employee_id text not null references public.employees(id),
  origin text not null check (origin in ('website', 'telegram')),
  notification_chat_id bigint,
  customer text not null,
  project text not null check (project in ('A', 'B')),
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  proposed_richard_pct integer not null check (proposed_richard_pct between 0 and 100),
  proposed_anastasia_pct integer not null check (proposed_anastasia_pct between 0 and 100),
  proposed_jean_claude_pct integer not null check (proposed_jean_claude_pct between 0 and 100),
  approved_richard_pct integer check (approved_richard_pct between 0 and 100),
  approved_anastasia_pct integer check (approved_anastasia_pct between 0 and 100),
  approved_jean_claude_pct integer check (approved_jean_claude_pct between 0 and 100),
  commission_pool_cents bigint not null default 0,
  richard_commission_cents bigint not null default 0,
  anastasia_commission_cents bigint not null default 0,
  jean_claude_commission_cents bigint not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  manager_changed boolean not null default false,
  approved_by text references public.employees(id),
  approved_at timestamptz,
  sheet_sync_status text not null default 'pending' check (sheet_sync_status in ('pending', 'synced', 'failed')),
  sheet_sync_error text,
  notification_status text not null default 'not_required' check (notification_status in ('not_required', 'pending', 'sent', 'failed', 'no_recipient')),
  notification_error text,
  check (proposed_richard_pct + proposed_anastasia_pct + proposed_jean_claude_pct = 100)
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  submitted_at timestamptz not null default now(),
  reporter_employee_id text not null references public.employees(id),
  origin text not null check (origin in ('website', 'telegram')),
  notification_chat_id bigint,
  description text not null,
  category text not null check (category in ('Materials', 'Travel', 'Other')),
  amount_cents bigint not null check (amount_cents > 0),
  proposed_allocation text not null check (proposed_allocation in ('A', 'B', 'Company overhead')),
  final_allocation text check (final_allocation in ('A', 'B', 'Company overhead')),
  status text not null check (status in ('awaiting_allocation', 'allocated')),
  manager_changed boolean not null default false,
  approved_by text references public.employees(id),
  approved_at timestamptz,
  sheet_sync_status text not null default 'pending' check (sheet_sync_status in ('pending', 'synced', 'failed')),
  sheet_sync_error text,
  notification_status text not null default 'not_required' check (notification_status in ('not_required', 'pending', 'sent', 'failed', 'no_recipient')),
  notification_error text
);

create index if not exists sales_status_idx on public.sales(status);
create index if not exists expenses_status_idx on public.expenses(status);
create index if not exists sales_submitter_idx on public.sales(submitter_employee_id);
create index if not exists expenses_reporter_idx on public.expenses(reporter_employee_id);

alter table public.employees enable row level security;
alter table public.telegram_links enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;

-- The application uses the server-only service role. No browser receives a Supabase key.
-- All permission checks happen in the API routes before database access.

commit;
