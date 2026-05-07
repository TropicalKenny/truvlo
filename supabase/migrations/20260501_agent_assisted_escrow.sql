alter table if exists invoice_meta
  add column if not exists job_type text not null default 'human_service'
    check (job_type in ('human_service', 'research_task', 'code_task', 'api_task', 'file_delivery')),
  add column if not exists verification_mode text not null default 'manual'
    check (verification_mode in ('manual', 'agent_assisted', 'deterministic')),
  add column if not exists success_criteria text,
  add column if not exists deliverable_url text,
  add column if not exists proof_text text;

create table if not exists agent_verifications (
  id uuid primary key default gen_random_uuid(),
  invoice_id text not null,
  creator_wallet text not null,
  client_wallet text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'passed', 'failed', 'needs_human_review')),
  confidence text not null default 'low'
    check (confidence in ('low', 'medium', 'high')),
  summary text,
  risks text,
  recommended_action text not null default 'manual_review'
    check (recommended_action in ('approve', 'dispute', 'manual_review')),
  verifier_type text not null default 'rule'
    check (verifier_type in ('rule', 'ai', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invoice_id, creator_wallet)
);

create index if not exists agent_verifications_invoice_idx
  on agent_verifications (invoice_id, creator_wallet);

alter table agent_verifications enable row level security;
