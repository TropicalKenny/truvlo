-- Hardening for dispute and agent-paid UX assumptions.
-- Apply via `supabase db push` or the Supabase SQL editor.

alter table if exists dispute_cases
  add column if not exists creator_wallet text;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'dispute_cases'
      and constraint_name = 'dispute_cases_invoice_id_key'
  ) then
    alter table dispute_cases drop constraint dispute_cases_invoice_id_key;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'dispute_cases'
      and indexname = 'dispute_cases_invoice_creator_key'
  ) then
    create unique index dispute_cases_invoice_creator_key
      on dispute_cases (invoice_id, creator_wallet);
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and constraint_name = 'dispute_evidence_type_check'
  ) then
    alter table dispute_evidence
      add constraint dispute_evidence_type_check
      check (evidence_type in ('deliverable_link', 'screenshot', 'transaction', 'conversation', 'other')) not valid;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and constraint_name = 'dispute_evidence_url_length_check'
  ) then
    alter table dispute_evidence
      add constraint dispute_evidence_url_length_check
      check (evidence_url is null or length(evidence_url) <= 2048) not valid;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and constraint_name = 'dispute_evidence_note_length_check'
  ) then
    alter table dispute_evidence
      add constraint dispute_evidence_note_length_check
      check (note is null or length(note) <= 4000) not valid;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'dispute_evidence'
      and constraint_name = 'dispute_evidence_not_empty_check'
  ) then
    alter table dispute_evidence
      add constraint dispute_evidence_not_empty_check
      check (
        nullif(trim(coalesce(evidence_url, '')), '') is not null
        or nullif(trim(coalesce(note, '')), '') is not null
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'agent_policies'
      and indexname = 'agent_policies_invoice_creator_client_key'
  ) then
    create unique index agent_policies_invoice_creator_client_key
      on agent_policies (invoice_id, creator_wallet, client_privy_id);
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'agent_policies'
      and indexname = 'agent_policies_agent_wallet_idx'
  ) then
    create index agent_policies_agent_wallet_idx
      on agent_policies (agent_wallet, status);
  end if;
end $$;

do $$
begin
  begin
    alter table dispute_evidence validate constraint dispute_evidence_type_check;
  exception when check_violation then
    raise notice 'Existing dispute_evidence rows violate dispute_evidence_type_check; clean rows before validating.';
  end;

  begin
    alter table dispute_evidence validate constraint dispute_evidence_url_length_check;
  exception when check_violation then
    raise notice 'Existing dispute_evidence rows violate dispute_evidence_url_length_check; clean rows before validating.';
  end;

  begin
    alter table dispute_evidence validate constraint dispute_evidence_note_length_check;
  exception when check_violation then
    raise notice 'Existing dispute_evidence rows violate dispute_evidence_note_length_check; clean rows before validating.';
  end;

  begin
    alter table dispute_evidence validate constraint dispute_evidence_not_empty_check;
  exception when check_violation then
    raise notice 'Existing dispute_evidence rows violate dispute_evidence_not_empty_check; clean rows before validating.';
  end;
end $$;
