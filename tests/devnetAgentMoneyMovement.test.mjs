import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agentActionsSource = await readFile('api/_agent-commerce.ts', 'utf8');
const vercelConfigSource = await readFile('vercel.json', 'utf8');
const migrationSource = await readFile('supabase/migrations/20260501_devnet_agent_money_movement.sql', 'utf8');
const x402IntentSource = agentActionsSource.slice(
  agentActionsSource.indexOf('export async function handleX402EscrowIntent'),
);

assert.match(agentActionsSource, /ENABLE_DEVNET_AGENT_MONEY_MOVEMENT/, 'agent money movement must be feature-flagged');
assert.match(agentActionsSource, /assertDevnetAutomationEnabled/, 'agent actions should centralize devnet gating');
assert.match(agentActionsSource, /DEVNET_AGENT_SECRET_KEY/, 'agent actions should require a server-side devnet agent signer');
assert.match(agentActionsSource, /DEVNET_AGENT_ALLOWED_WALLETS/, 'agent actions should require an allowlisted agent wallet');
assert.match(agentActionsSource, /DEVNET_AGENT_MAX_AMOUNT_USD/, 'agent actions should enforce an amount cap');
assert.match(agentActionsSource, /pay_invoice.*request_release.*approve_release.*raise_dispute/s, 'agent actions should support pay, request, approve, and dispute demo actions');
assert.doesNotMatch(agentActionsSource, /resolveDispute|storeVerdictHash/, 'agent actions must not resolve disputes autonomously');
assert.match(agentActionsSource, /recommended_action.*approve/s, 'agent approval should require an approve recommendation');
assert.match(agentActionsSource, /recommended_action.*dispute/s, 'agent dispute should require a dispute recommendation');
assert.match(agentActionsSource, /Truvlo devnet demo automation/, 'agent response should label automation as devnet demo behavior');

assert.match(x402IntentSource, /402/, 'x402 intent route should emit Payment Required responses');
assert.match(x402IntentSource, /X-PAYMENT/, 'x402 intent route should read the x402 payment header');
assert.match(x402IntentSource, /paymentRequirements/, 'x402 intent route should return payment requirements');
assert.match(x402IntentSource, /scheme:\s*'exact'/, 'x402 payment requirements should use exact scheme');
assert.match(agentActionsSource, /X402_NETWORK = 'solana:devnet'/, 'x402 demo route should be locked to Solana devnet');
assert.match(x402IntentSource, /ENABLE_DEVNET_X402_ESCROW_INTENTS/, 'x402 route should be feature-flagged');
assert.match(x402IntentSource, /from\('x402_escrow_intents'\)/, 'x402 route should persist escrow intents');
assert.doesNotMatch(x402IntentSource, /approveRelease|raiseDispute|releaseFunds|resolveDispute/, 'x402 intent route must not move funds directly');
assert.match(vercelConfigSource, /agent-verifications.*create-invoice-meta/s, 'agent verification route should be rewritten into an existing function');
assert.match(vercelConfigSource, /devnet-agent-actions.*create-invoice-meta/s, 'devnet agent action route should be rewritten into an existing function');
assert.match(vercelConfigSource, /x402-escrow-intent.*create-invoice-meta/s, 'x402 route should be rewritten into an existing function');

assert.match(migrationSource, /create table if not exists x402_escrow_intents/, 'migration should create x402_escrow_intents');
assert.match(migrationSource, /create table if not exists devnet_agent_actions/, 'migration should create devnet_agent_actions');
assert.match(migrationSource, /alter table x402_escrow_intents enable row level security/, 'x402 intent table should have RLS enabled');
assert.match(migrationSource, /alter table devnet_agent_actions enable row level security/, 'agent action table should have RLS enabled');

console.log('devnet agent money movement tests passed');
