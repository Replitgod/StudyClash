create table if not exists public.enterprise_leads (
  id uuid primary key default gen_random_uuid(),
  submitter_user_id uuid references auth.users(id) on delete set null,
  email text not null,
  organization text not null,
  role text,
  seats text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  source text not null default 'classroom_page',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_contacted_at timestamptz
);

create index if not exists idx_enterprise_leads_status_created
  on public.enterprise_leads (status, created_at desc);

create index if not exists idx_enterprise_leads_email
  on public.enterprise_leads (email);
