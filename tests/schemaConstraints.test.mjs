import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260507_dispute_agent_hardening.sql', 'utf8');
const disputesApi = await readFile('api/disputes.ts', 'utf8');
const dashboard = await readFile('src/components/Dashboard.tsx', 'utf8');

assert.match(migration, /drop constraint dispute_cases_invoice_id_key/, 'migration should remove invoice-only dispute uniqueness');
assert.match(migration, /create unique index dispute_cases_invoice_creator_key[\s\S]*on dispute_cases \(invoice_id, creator_wallet\)/, 'migration should enforce one dispute per invoice and creator');
assert.match(migration, /dispute_evidence_type_check[\s\S]*deliverable_link[\s\S]*screenshot[\s\S]*transaction[\s\S]*conversation[\s\S]*other/, 'migration should constrain evidence types');
assert.match(migration, /dispute_evidence_url_length_check[\s\S]*length\(evidence_url\) <= 2048/, 'migration should constrain evidence URL length');
assert.match(migration, /dispute_evidence_note_length_check[\s\S]*length\(note\) <= 4000/, 'migration should constrain evidence note length');
assert.match(migration, /dispute_evidence_not_empty_check/, 'migration should require evidence URL or note');
assert.match(migration, /create unique index agent_policies_invoice_creator_client_key[\s\S]*on agent_policies \(invoice_id, creator_wallet, client_privy_id\)/, 'migration should document agent policy scope by invoice creator and client');
assert.match(migration, /agent_policies_agent_wallet_idx/, 'migration should index agent wallet status lookups');

assert.match(disputesApi, /\.eq\('creator_wallet', normalizeSolanaAddress\(creatorWallet\)\)/, 'API should use the composite dispute lookup');
assert.match(dashboard, /isInvoicePaidByAgent/, 'UI should not rely on policy existence alone after schema hardening');

console.log('schema constraint tests passed');
