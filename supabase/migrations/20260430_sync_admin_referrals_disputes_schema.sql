create extension if not exists pgcrypto;

alter table if exists profiles
  add column if not exists referral_code text,
  add column if not exists referred_by_code text,
  add column if not exists referral_linked_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz;

create unique index if not exists profiles_referral_code_key
  on profiles (referral_code)
  where referral_code is not null;

create index if not exists profiles_referred_by_code_idx
  on profiles (referred_by_code);

alter table if exists invoice_meta
  add column if not exists client_wallet text,
  add column if not exists creator_privy_id text,
  add column if not exists client_privy_id text,
  add column if not exists referral_reward_recorded_at timestamptz,
  add column if not exists dispute_case_id uuid;

alter table if exists referral_rewards
  add column if not exists referred_privy_id text,
  add column if not exists referrer_wallet text,
  add column if not exists referral_code text,
  add column if not exists invoice_amount numeric(20, 9) not null default 0,
  add column if not exists platform_fee numeric(20, 9) not null default 0,
  add column if not exists reward_pool numeric(20, 9) not null default 0,
  add column if not exists reward_share_bps integer not null default 10000,
  add column if not exists requestable_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists referral_rewards_referrer_privy_status_idx
  on referral_rewards (referrer_privy_id, status, token_type);

create index if not exists referral_rewards_invoice_idx
  on referral_rewards (invoice_id);

create table if not exists payout_requests (
  id uuid primary key default gen_random_uuid(),
  privy_id text not null,
  token_type text not null check (token_type in ('USDC', 'SOL')),
  payout_wallet text not null,
  amount numeric(20, 9) not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'scheduled', 'paid', 'rejected')),
  payout_cycle_date date,
  request_deadline timestamptz,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists payout_requests
  add column if not exists processed_by text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists payout_requests_privy_token_idx
  on payout_requests (privy_id, token_type, status);

create unique index if not exists payout_requests_one_pending_per_user
  on payout_requests (privy_id, token_type)
  where status = 'pending';

create table if not exists dispute_cases (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null unique,
  creator_wallet text not null,
  client_wallet text,
  creator_privy_id text,
  client_privy_id text,
  opened_by_privy_id text not null,
  opened_by_role text not null check (opened_by_role in ('creator', 'client', 'admin')),
  status text not null default 'open' check (status in ('open', 'under_review', 'resolved', 'closed')),
  opened_at timestamptz not null default now(),
  evidence_deadline_at timestamptz not null,
  resolution_creator_bps integer,
  resolution_client_bps integer,
  resolved_by_privy_id text,
  resolved_at timestamptz,
  decision text check (decision in ('creator', 'client', 'split')),
  verdict_note text,
  verdict_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispute_cases_status_idx
  on dispute_cases (status);

create table if not exists dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references dispute_cases(id) on delete cascade,
  submitted_by_privy_id text not null,
  submitted_by_wallet text not null,
  side text not null check (side in ('creator', 'client', 'admin')),
  evidence_type text not null,
  evidence_url text,
  note text,
  created_at timestamptz not null default now()
);

alter table if exists dispute_evidence
  add column if not exists case_id uuid references dispute_cases(id) on delete cascade,
  add column if not exists submitted_by_privy_id text,
  add column if not exists submitted_by_wallet text,
  add column if not exists side text,
  add column if not exists evidence_type text,
  add column if not exists evidence_url text,
  add column if not exists note text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and column_name = 'invoice_id'
  ) then
    alter table dispute_evidence alter column invoice_id drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and column_name = 'submitted_by'
  ) then
    alter table dispute_evidence alter column submitted_by drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and column_name = 'role'
  ) then
    alter table dispute_evidence alter column role drop not null;
  end if;
end $$;

create index if not exists dispute_evidence_case_idx
  on dispute_evidence (case_id, created_at);
