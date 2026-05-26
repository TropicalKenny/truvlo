-- Phase 1 foundation for autonomous escrow: durable agent identities,
-- developer app identities, and scoped API credentials. These tables are
-- service-role-only; browser clients must use authenticated API routes.

create table if not exists agent_identities (
  id uuid primary key default gen_random_uuid(),
  owner_privy_id text not null,
  display_name text not null check (length(display_name) between 1 and 120),
  auth_method text not null default 'api_key'
    check (auth_method in ('api_key', 'signed_request', 'oauth_client_credentials', 'service_identity')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'revoked', 'expired')),
  wallet_authority_model text not null default 'truvlo_controlled_privy_server_wallet'
    check (wallet_authority_model in ('truvlo_controlled_privy_server_wallet', 'user_delegated_signer', 'external_self_custody')),
  agent_wallet text,
  max_invoice_amount numeric(20, 9),
  daily_spend_limit numeric(20, 9),
  token_scope text[] not null default array['SOL', 'USDC']::text[]
    check (token_scope <@ array['SOL', 'USDC']::text[]),
  allowed_actions text[] not null default array[]::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_credentials (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agent_identities(id) on delete cascade,
  credential_prefix text not null,
  credential_hash text not null,
  scopes text[] not null default array[]::text[],
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credential_hash <> credential_prefix)
);

create table if not exists developer_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_privy_id text not null,
  display_name text not null check (length(display_name) between 1 and 160),
  status text not null default 'active'
    check (status in ('active', 'paused', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists developer_apps (
  id uuid primary key default gen_random_uuid(),
  developer_account_id uuid not null references developer_accounts(id) on delete cascade,
  owner_privy_id text not null,
  display_name text not null check (length(display_name) between 1 and 160),
  environment text not null default 'devnet'
    check (environment in ('sandbox', 'devnet', 'mainnet')),
  allowed_environments text[] not null default array['devnet']::text[]
    check (allowed_environments <@ array['sandbox', 'devnet', 'mainnet']::text[]),
  credential_status text not null default 'not_issued'
    check (credential_status in ('not_issued', 'active', 'rotating', 'revoked')),
  webhook_status text not null default 'not_configured'
    check (webhook_status in ('not_configured', 'active', 'failing', 'paused')),
  usage_tier text not null default 'sandbox'
    check (usage_tier in ('sandbox', 'beta', 'production', 'enterprise')),
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute > 0),
  status text not null default 'test_only'
    check (status in ('active', 'test_only', 'paused', 'revoked', 'production_gated')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists api_credentials (
  id uuid primary key default gen_random_uuid(),
  developer_app_id uuid not null references developer_apps(id) on delete cascade,
  credential_prefix text not null,
  credential_hash text not null,
  scopes text[] not null default array[]::text[],
  environment text not null default 'devnet'
    check (environment in ('sandbox', 'devnet', 'mainnet')),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired')),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (credential_hash <> credential_prefix)
);

create index if not exists agent_identities_owner_status_idx
  on agent_identities (owner_privy_id, status, expires_at);

create index if not exists agent_credentials_agent_status_idx
  on agent_credentials (agent_id, status, expires_at);

create unique index if not exists agent_credentials_prefix_key
  on agent_credentials (credential_prefix);

create index if not exists developer_accounts_owner_status_idx
  on developer_accounts (owner_privy_id, status);

create index if not exists developer_apps_account_status_idx
  on developer_apps (developer_account_id, status, environment);

create index if not exists developer_apps_owner_status_idx
  on developer_apps (owner_privy_id, status);

create unique index if not exists api_credentials_prefix_key
  on api_credentials (credential_prefix);

create index if not exists api_credentials_app_status_idx
  on api_credentials (developer_app_id, status, expires_at);

alter table agent_identities enable row level security;
alter table agent_credentials enable row level security;
alter table developer_accounts enable row level security;
alter table developer_apps enable row level security;
alter table api_credentials enable row level security;

create policy direct_client_access_disabled on agent_identities
  for all to anon, authenticated using (false) with check (false);

create policy direct_client_access_disabled on agent_credentials
  for all to anon, authenticated using (false) with check (false);

create policy direct_client_access_disabled on developer_accounts
  for all to anon, authenticated using (false) with check (false);

create policy direct_client_access_disabled on developer_apps
  for all to anon, authenticated using (false) with check (false);

create policy direct_client_access_disabled on api_credentials
  for all to anon, authenticated using (false) with check (false);

comment on table agent_identities is
  'Service-role-only durable agent identity records for policy-bounded autonomous escrow.';
comment on table agent_credentials is
  'Service-role-only hashed agent API credentials. Raw credentials must never be stored.';
comment on table developer_accounts is
  'Service-role-only developer account records for external platform builders.';
comment on table developer_apps is
  'Service-role-only developer app records with environment, webhook, usage, and revocation state.';
comment on table api_credentials is
  'Service-role-only hashed developer API credentials. Raw credentials must never be stored.';
