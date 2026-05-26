import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260526_agent_developer_identity.sql', 'utf8');

assert.match(migration, /create table if not exists agent_identities/, 'migration should create durable agent identities');
assert.match(migration, /owner_privy_id text not null/, 'agent identity should be bound to a human owner');
assert.match(migration, /auth_method text not null/, 'agent identity should record its authentication method');
assert.match(migration, /status text not null default 'active'\s+check \(status in \('active', 'paused', 'revoked', 'expired'\)\)/, 'agent status should include active, paused, revoked, and expired');
assert.match(migration, /last_used_at timestamptz/, 'agent identity should track last use');
assert.match(migration, /revoked_at timestamptz/, 'agent identity should track revocation time');
assert.match(migration, /create index if not exists agent_identities_owner_status_idx/, 'agent identities should be indexed by owner and status');

assert.match(migration, /create table if not exists developer_accounts/, 'migration should create developer accounts');
assert.match(migration, /create table if not exists developer_apps/, 'migration should create developer apps');
assert.match(migration, /developer_account_id uuid not null references developer_accounts\(id\)/, 'developer apps should belong to developer accounts');
assert.match(migration, /allowed_environments text\[\] not null default array\['devnet'\]::text\[\]/, 'developer apps should record allowed environments');
assert.match(migration, /usage_tier text not null default 'sandbox'/, 'developer apps should store usage tier');
assert.match(migration, /webhook_status text not null default 'not_configured'/, 'developer apps should store webhook status');
assert.match(migration, /status text not null default 'test_only'\s+check \(status in \('active', 'test_only', 'paused', 'revoked', 'production_gated'\)\)/, 'developer app status should support production gating');

assert.match(migration, /create table if not exists api_credentials/, 'migration should create scoped API credentials');
assert.match(migration, /credential_hash text not null/, 'API credentials should store a hash, not the raw key');
assert.match(migration, /credential_prefix text not null/, 'API credentials should store only a safe prefix for display');
assert.match(migration, /scopes text\[\] not null default array\[\]::text\[\]/, 'API credentials should store scopes');
assert.match(migration, /check \(credential_hash <> credential_prefix\)/, 'credential hash should not equal the display prefix');
assert.doesNotMatch(migration, /raw_api_key|plain_api_key|private_key text|secret_key text/i, 'migration must not store raw API keys or private keys');

for (const tableName of ['agent_identities', 'agent_credentials', 'developer_accounts', 'developer_apps', 'api_credentials']) {
  assert.match(migration, new RegExp(`alter table ${tableName} enable row level security`), `${tableName} should enable RLS`);
  assert.match(migration, new RegExp(`create policy direct_client_access_disabled on ${tableName}`), `${tableName} should deny direct browser access`);
}

console.log('phase 1 identity model tests passed');
