import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('api/_phase1-policy.ts', 'utf8');

assert.match(source, /export const PHASE1_POLICY_ERROR_CODES/, 'policy evaluator should expose stable machine error codes');
assert.match(source, /MISSING_CREDENTIAL: 'missing_credential'/, 'missing credentials should have a stable code');
assert.match(source, /AGENT_REVOKED: 'agent_revoked'/, 'revoked agents should have a stable code');
assert.match(source, /DEVELOPER_APP_PRODUCTION_GATED: 'developer_app_production_gated'/, 'production-gated apps should have a stable code');
assert.match(source, /ACTION_NOT_ALLOWED: 'action_not_allowed'/, 'disallowed actions should have a stable code');
assert.match(source, /AMOUNT_LIMIT_EXCEEDED: 'amount_limit_exceeded'/, 'over-limit requests should have a stable code');

assert.match(source, /createHash\('sha256'\)/, 'API credentials should be hashed with SHA-256');
assert.match(source, /timingSafeEqual/, 'credential hash comparisons should use timing-safe equality');
assert.match(source, /credential_hash|expectedHash/, 'credential logic should compare against stored hashes');
assert.doesNotMatch(source, /console\.log\(|console\.error\(/, 'policy evaluator should not log credentials or policy details');

assert.match(source, /export function extractApiCredential/, 'policy evaluator should extract API credentials from request headers');
assert.match(source, /x-truvlo-api-key/, 'API key header should be supported');
assert.match(source, /Bearer\\s\+/, 'Bearer authorization should be supported');

assert.match(source, /export function evaluateAgentIdentity/, 'policy evaluator should check agent identity state');
assert.match(source, /agent\.status === 'paused'/, 'paused agents should be denied');
assert.match(source, /agent\.status === 'revoked'/, 'revoked agents should be denied');
assert.match(source, /agent\.status === 'expired'/, 'expired agents should be denied');

assert.match(source, /export function evaluateDeveloperApp/, 'policy evaluator should check developer app state');
assert.match(source, /app\.status === 'production_gated'/, 'production-gated developer apps should be denied');
assert.match(source, /app\.status === 'test_only' && request\.environment === 'mainnet'/, 'test-only apps should not access mainnet');
assert.match(source, /allowed_environments\?\.length/, 'developer app environment allowlists should be enforced');

assert.match(source, /export function evaluateCapabilityPolicy/, 'policy evaluator should check request capabilities');
assert.match(source, /allowed_actions\?\.length/, 'allowed actions should be enforced');
assert.match(source, /token_scope\?\.length/, 'token scope should be enforced');
assert.match(source, /requestedAmount > maxAmount/, 'amount caps should be enforced');

assert.match(source, /export function evaluatePhase1Request/, 'policy evaluator should compose agent and developer app checks');
assert.match(source, /const agentDecision = evaluateAgentIdentity/, 'combined evaluator should check agent first');
assert.match(source, /const developerDecision = evaluateDeveloperApp/, 'combined evaluator should check developer app when present');

console.log('phase 1 policy evaluator tests passed');
