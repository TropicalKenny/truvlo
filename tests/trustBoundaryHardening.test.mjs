import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const createInvoiceMetaSource = await readFile('api/create-invoice-meta.ts', 'utf8');
const verificationApiSource = await readFile('api/_agent-commerce.ts', 'utf8');
const migrationSource = await readFile('supabase/migrations/add_payout_and_dispute_constraints.sql', 'utf8');
const gitignoreSource = await readFile('.gitignore', 'utf8');

const verificationHandlerSource = verificationApiSource.slice(
  verificationApiSource.indexOf('export async function handleAgentVerifications'),
  verificationApiSource.indexOf('function assertDevnetAutomationEnabled'),
);

assert.match(
  createInvoiceMetaSource,
  /resolveAppOrigin/,
  'invoice metadata API should generate invoice links from a trusted server-side origin',
);
assert.doesNotMatch(
  createInvoiceMetaSource,
  /invoiceId, creatorWallet, clientWallet, clientEmail, senderName,\s*\n\s*description, tokenType, amount, invoiceUrl,/,
  'invoice metadata API must not trust invoiceUrl from the request body',
);
assert.match(
  createInvoiceMetaSource,
  /invoice_url:\s*invoiceUrl/,
  'invoice metadata API should persist the server-generated invoice URL',
);
assert.match(
  createInvoiceMetaSource,
  /escapeHtml|escapeAttribute/,
  'invoice metadata email template should escape user-controlled fields',
);

assert.doesNotMatch(
  verificationHandlerSource,
  /successCriteria, deliverableUrl, proofText,\s*\n\s*verificationStatus/,
  'agent verification submissions must not accept caller-supplied result fields',
);
assert.doesNotMatch(
  verificationHandlerSource,
  /verificationStatus\s*&&|confidence\s*&&|recommendedAction\s*&&|verifierType\s*&&|verificationStatus\s*\?\?|recommendedAction\s*\?\?/,
  'agent verification handler should not validate or prefer caller-supplied result fields',
);
assert.match(
  verificationHandlerSource,
  /verification_status:\s*ruleResult\.verificationStatus/,
  'verification status should be derived server-side',
);
assert.match(
  verificationHandlerSource,
  /recommended_action:\s*ruleResult\.recommendedAction/,
  'verification recommendation should be derived server-side',
);

assert.doesNotMatch(
  migrationSource,
  /UNIQUE\s*\(\s*invoice_id\s*\)/i,
  'dispute uniqueness should not be invoice-id only',
);
assert.match(
  migrationSource,
  /invoice_id,\s*creator_wallet/,
  'dispute uniqueness should include creator wallet',
);

assert.doesNotMatch(
  gitignoreSource,
  /(^|\n)(tests|scripts|docs)\s*($|\n)/,
  'project tests, scripts, and docs should not be ignored',
);
assert.match(
  gitignoreSource,
  /\.codex-temp-index-\*/,
  'temporary Codex index files should be ignored',
);

console.log('trust boundary hardening tests passed');
