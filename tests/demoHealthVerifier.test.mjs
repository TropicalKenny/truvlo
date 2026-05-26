import assert from 'node:assert/strict';

import {
  classifyEmailConfig,
  classifyRouteStatus,
  classifyRpcHealth,
  normalizeBaseUrl,
  shouldFailHealthCheck,
} from '../scripts/verify-demo-health.mjs';

assert.equal(normalizeBaseUrl('https://truvlo.example/'), 'https://truvlo.example');

assert.deepEqual(
  classifyRouteStatus({ path: '/api/profile', okStatuses: [401], warningStatuses: [] }, 401),
  { level: 'pass', reason: 'expected_status' },
  'unauthenticated profile checks should pass on expected 401 responses'
);

assert.deepEqual(
  classifyRouteStatus({ path: '/api/agent-policies', okStatuses: [400], warningStatuses: [] }, 400),
  { level: 'pass', reason: 'expected_status' },
  'agent policy checks should pass on expected missing-field 400 responses'
);

assert.deepEqual(
  classifyRouteStatus({ path: '/api/agent-credentials', okStatuses: [401], warningStatuses: [] }, 401),
  { level: 'pass', reason: 'expected_status' },
  'agent credential checks should pass on expected unauthenticated 401 responses'
);

assert.deepEqual(
  classifyRouteStatus({ path: '/api/sol-price', okStatuses: [200], warningStatuses: [503] }, 503),
  { level: 'warn', reason: 'expected_warning_status' },
  'temporary upstream price failures should be warnings, not demo route blockers'
);

assert.deepEqual(
  classifyRpcHealth({ status: 429, bodyText: 'Too many requests' }),
  { status: 'rate_limited', level: 'warn', detail: 'RPC returned HTTP 429' },
  'public devnet rate limits should be recorded without failing the whole verifier'
);

assert.deepEqual(
  classifyRpcHealth({ status: 200, bodyText: '{"result":{"context":{},"value":{"blockhash":"abc"}}}' }),
  { status: 'healthy', level: 'pass', detail: 'RPC returned latest blockhash' },
  'latest blockhash responses should be healthy'
);

assert.equal(
  shouldFailHealthCheck([
    { level: 'pass', label: 'home' },
    { level: 'warn', label: 'sol-price' },
  ]),
  false,
  'warnings should not make the verifier fail'
);

assert.equal(
  shouldFailHealthCheck([{ level: 'fail', label: 'dashboard' }]),
  true,
  'real route failures should make the verifier fail'
);

assert.deepEqual(
  classifyEmailConfig({ RESEND_API_KEY: 'set', FROM_EMAIL: 'onboarding@resend.dev' }),
  { status: 'test_sender_limited', level: 'warn', detail: 'Resend test sender is configured; delivery is limited until a sender domain is verified.' },
  'Resend test sender mode should be documented as a warning'
);

console.log('demo health verifier tests passed');
