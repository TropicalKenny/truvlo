create table if not exists agent_policies (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  creator_wallet text not null,
  client_wallet text not null,
  client_privy_id text not null,
  agent_wallet text not null,
  max_amount numeric(20, 9) not null,
  token_type text not null check (token_type in ('USDC', 'SOL')),
  can_pay boolean not null default true,
  can_approve_release boolean not null default true,
  can_raise_dispute boolean not null default false,
  approval_rule text not null default 'verification_passed_and_recommended_approve'
    check (approval_rule in ('verification_passed_and_recommended_approve')),
  status text not null default 'active'
    check (status in ('active', 'disabled', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, creator_wallet)
);

create index if not exists agent_policies_invoice_idx
  on agent_policies (invoice_id, creator_wallet);

create index if not exists agent_policies_client_idx
  on agent_policies (client_privy_id, status, expires_at);

alter table agent_policies enable row level security;
