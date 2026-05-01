import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const createInvoiceSource = await readFile('src/components/CreateInvoiceForm.tsx', 'utf8');
const approveReleaseSource = await readFile('src/components/ApproveRelease.tsx', 'utf8');
const dashboardSource = await readFile('src/components/Dashboard.tsx', 'utf8');
const createInvoiceMetaSource = await readFile('api/create-invoice-meta.ts', 'utf8');
const verificationApiSource = await readFile('api/_agent-commerce.ts', 'utf8');
const migrationSource = await readFile('supabase/migrations/20260501_agent_assisted_escrow.sql', 'utf8');

const verificationHandlerSource = verificationApiSource.slice(
  verificationApiSource.indexOf('export async function handleAgentVerifications'),
  verificationApiSource.indexOf('function assertDevnetAutomationEnabled'),
);

assert.match(createInvoiceSource, /Agent-assisted escrow/, 'invoice form should expose agent-assisted escrow mode');
assert.match(createInvoiceSource, /jobType/, 'invoice form should track agent job type');
assert.match(createInvoiceSource, /verificationMode/, 'invoice form should track verification mode');
assert.match(createInvoiceSource, /successCriteria/, 'invoice form should collect success criteria');
assert.match(createInvoiceSource, /deliverableUrl/, 'invoice form should collect an optional deliverable URL');
assert.match(createInvoiceSource, /proofText/, 'invoice form should collect optional proof text');
assert.match(createInvoiceSource, /jobType:\s*agentMode \? jobType : 'human_service'/, 'invoice metadata payload should include job type with human fallback');
assert.match(createInvoiceSource, /verificationMode:\s*agentMode \? verificationMode : 'manual'/, 'invoice metadata payload should include verification mode with manual fallback');

assert.match(createInvoiceMetaSource, /jobType/, 'create-invoice metadata API should accept job type');
assert.match(createInvoiceMetaSource, /verificationMode/, 'create-invoice metadata API should accept verification mode');
assert.match(createInvoiceMetaSource, /successCriteria/, 'create-invoice metadata API should persist success criteria');
assert.match(createInvoiceMetaSource, /deliverableUrl/, 'create-invoice metadata API should persist deliverable URL');
assert.match(createInvoiceMetaSource, /proofText/, 'create-invoice metadata API should persist proof text');
assert.match(createInvoiceMetaSource, /handleAgentVerifications/, 'create-invoice metadata API should dispatch agent verification rewrites');

assert.match(verificationApiSource, /VALID_VERIFICATION_STATUSES/, 'verification API should whitelist verification statuses');
assert.match(verificationApiSource, /pending.*passed.*failed.*needs_human_review/s, 'verification API should include all allowed statuses');
assert.match(verificationApiSource, /VALID_RECOMMENDED_ACTIONS/, 'verification API should whitelist recommended actions');
assert.match(verificationApiSource, /approve.*dispute.*manual_review/s, 'verification API should keep recommendations advisory');
assert.doesNotMatch(verificationHandlerSource, /approveRelease|raiseDispute|releaseFunds|resolveDispute/, 'verification API must not move escrow funds');
assert.match(verificationHandlerSource, /from\('agent_verifications'\)/, 'verification API should use the agent_verifications table');
assert.match(verificationHandlerSource, /from\('invoice_meta'\)/, 'verification API should authorize against invoice metadata');

assert.match(approveReleaseSource, /agentVerification/, 'approval page should load agent verification data');
assert.match(approveReleaseSource, /Agent-assisted review/, 'approval page should show agent review copy');
assert.match(approveReleaseSource, /This is a recommendation, not an automatic release/, 'approval page should state the safety boundary');

assert.match(dashboardSource, /agentVerificationMeta/, 'dashboard should load agent verification metadata');
assert.match(dashboardSource, /Agent review pending|Looks complete|Needs review|Risk flagged/, 'dashboard should show agent review status labels');

assert.match(migrationSource, /create table if not exists agent_verifications/, 'migration should create agent_verifications');
assert.match(migrationSource, /verification_status text not null/, 'migration should constrain verification status');
assert.match(migrationSource, /recommended_action text not null/, 'migration should store advisory recommendation');
assert.match(migrationSource, /alter table agent_verifications enable row level security/, 'agent_verifications should have RLS enabled');
assert.match(migrationSource, /alter table if exists invoice_meta[\s\S]*job_type/, 'migration should add agent metadata fields to invoice_meta');

console.log('agent-assisted escrow tests passed');
