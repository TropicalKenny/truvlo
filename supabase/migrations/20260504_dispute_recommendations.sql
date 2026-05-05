alter table if exists dispute_cases
  add column if not exists recommendation_decision text
    check (recommendation_decision in ('creator', 'client', 'split')),
  add column if not exists recommendation_creator_bps integer,
  add column if not exists recommendation_client_bps integer,
  add column if not exists recommendation_confidence text
    check (recommendation_confidence in ('low', 'medium', 'high')),
  add column if not exists recommendation_note text,
  add column if not exists recommendation_risks text,
  add column if not exists recommendation_generated_by_privy_id text,
  add column if not exists recommendation_generated_at timestamptz,
  add column if not exists verdict_hash_signature text,
  add column if not exists resolution_signature text,
  add column if not exists onchain_resolved_at timestamptz;

create index if not exists dispute_cases_recommendation_generated_idx
  on dispute_cases (recommendation_generated_at desc)
  where recommendation_generated_at is not null;

create index if not exists dispute_cases_onchain_resolved_idx
  on dispute_cases (onchain_resolved_at desc)
  where onchain_resolved_at is not null;
