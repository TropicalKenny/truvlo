import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const invoicePaymentSource = await readFile('src/components/InvoicePayment.tsx', 'utf8');
const approveReleaseSource = await readFile('src/components/ApproveRelease.tsx', 'utf8');
const dashboardSource = await readFile('src/components/Dashboard.tsx', 'utf8');
const createInvoiceMetaSource = await readFile('api/create-invoice-meta.ts', 'utf8');
const agentCommerceSource = await readFile('api/_agent-commerce.ts', 'utf8');
const vercelConfigSource = await readFile('vercel.json', 'utf8');
const migrationSource = await readFile('supabase/migrations/20260501_agent_policies.sql', 'utf8');

assert.match(invoicePaymentSource, /Use Truvlo Agent/, 'invoice page should render the managed agent panel');
assert.match(invoicePaymentSource, /handleEnableAgentPolicy/, 'invoice page should enable a client agent policy');
assert.match(invoicePaymentSource, /authenticated[\s\S]*login\(\)/, 'enabling the agent should require client login');
assert.match(invoicePaymentSource, /agentEndpoint=agent-policies/, 'invoice page should create and fetch agent policies');
assert.match(invoicePaymentSource, /fetch\('\/api\/devnet-agent-actions'/, 'invoice page should trigger devnet agent payment after policy creation');
assert.match(invoicePaymentSource, /invoice-only/, 'agent panel should explain invoice-only scope');
assert.match(invoicePaymentSource, /verification passes/, 'agent panel should explain the approval rule');
assert.match(invoicePaymentSource, /automatically approve release/, 'agent panel should explain approval is policy-driven after proof');
assert.match(approveReleaseSource, /Truvlo Agent is acting for the client/, 'approval page should show active agent policy audit messaging');
assert.match(approveReleaseSource, /handleAgentPolicyAction/, 'approval page should route agent-paid invoices through the managed agent signer');
assert.match(approveReleaseSource, /clientCommanded:\s*true/, 'approval page should mark human client fallback actions as explicitly commanded');
assert.match(approveReleaseSource, /Truvlo Agent paid this invoice/, 'approval page should explain that the agent signer will act for agent-paid invoices');
assert.match(approveReleaseSource, /connectedWalletMatchesClient \|\| canUseAgentPolicy/, 'approval buttons should remain usable when a valid agent policy exists');
assert.match(dashboardSource, /Truvlo Agent enabled/, 'dashboard should show active agent policy status');
assert.match(dashboardSource, /maybeRequestAndAgentApprove/, 'dashboard proof submission should hand off to managed agent approval');
assert.match(dashboardSource, /sdk\.requestRelease\(proofModal\.invoice\.invoiceId,\s*proofModal\.invoice\.tokenType\)/, 'proof submission should request release from the creator wallet before agent approval');
assert.match(dashboardSource, /action:\s*'approve_release'/, 'proof submission should ask Truvlo Agent to approve release after verification passes');
assert.match(dashboardSource, /verification_status !== 'passed'[\s\S]*recommended_action !== 'approve'/, 'agent approval should require passed verification and approve recommendation');
assert.match(dashboardSource, /Agent approval submitted/, 'dashboard should confirm when Truvlo Agent approval is requested');

assert.match(createInvoiceMetaSource, /handleAgentPolicies/, 'create-invoice metadata API should dispatch agent policy rewrites');
assert.match(vercelConfigSource, /agent-policies.*create-invoice-meta/s, 'agent policy route should be rewritten into the consolidated function');

assert.match(agentCommerceSource, /export async function handleAgentPolicies/, 'agent commerce helper should expose an agent policy handler');
assert.match(agentCommerceSource, /from\('agent_policies'\)/, 'agent policy handler should use the agent_policies table');
assert.match(agentCommerceSource, /client_privy_id/, 'agent policy should store the authenticated client owner');
assert.match(agentCommerceSource, /approval_rule:\s*'verification_passed_and_recommended_approve'/, 'default policy should require passed verification and approve recommendation');
assert.match(agentCommerceSource, /loadActiveAgentPolicy/, 'devnet agent actions should load an active agent policy');
assert.match(agentCommerceSource, /No active Truvlo Agent policy/, 'devnet agent actions should reject missing policies');
assert.match(agentCommerceSource, /clientCommanded/, 'devnet agent actions should distinguish explicit human client commands from automation');
assert.match(agentCommerceSource, /policy\.client_privy_id !== clientCommandUserId/, 'client-commanded agent actions should require the policy owner');
assert.match(agentCommerceSource, /can_pay/, 'pay_invoice should require policy permission to pay');
assert.match(agentCommerceSource, /can_approve_release/, 'approve_release should require policy permission to approve');
assert.match(agentCommerceSource, /expires_at/, 'agent policy enforcement should check expiry');

assert.match(migrationSource, /create table if not exists agent_policies/, 'migration should create agent_policies');
assert.match(migrationSource, /client_privy_id text not null/, 'policy table should store client Privy owner');
assert.match(migrationSource, /approval_rule text not null/, 'policy table should store approval rule');
assert.match(migrationSource, /can_raise_dispute boolean not null default false/, 'policy table should default dispute authority off');
assert.match(migrationSource, /alter table agent_policies enable row level security/, 'agent_policies should have RLS enabled');

console.log('agent policy delegation tests passed');
