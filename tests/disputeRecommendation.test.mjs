import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const disputesApiSource = await readFile('api/disputes.ts', 'utf8');
const adminApiSource = await readFile('api/admin-overview.ts', 'utf8');
const adminHelperSource = await readFile('api/_admin.ts', 'utf8');
const adminPageSource = await readFile('src/pages/AdminPage.tsx', 'utf8');
const sdkSource = await readFile('src/lib/escrowPaySDK.ts', 'utf8');
const contractSource = await readFile('contracts/programs/workspace/src/lib.rs', 'utf8');
const idlSource = await readFile('src/idl/workspace.json', 'utf8');
const migrationSource = await readFile('supabase/migrations/20260504_dispute_recommendations.sql', 'utf8');

const recommendStart = disputesApiSource.indexOf("if (action === 'recommend')");
const resolveStart = disputesApiSource.indexOf("if (action === 'resolve')", recommendStart);
const recommendBlock = disputesApiSource.slice(recommendStart, resolveStart);

assert.ok(recommendStart > -1, 'dispute API should expose a recommend action');
assert.ok(resolveStart > recommendStart, 'recommend action should stay separate from resolve action');

assert.match(adminHelperSource, /'dispute_recommend'/, 'admin permissions should include dispute recommendation');
assert.match(adminHelperSource, /dispute_admin:[\s\S]*'dispute_recommend'/, 'dispute admins should be able to generate recommendations');

assert.match(disputesApiSource, /buildDisputeRecommendation/, 'dispute API should include a recommendation builder');
assert.match(recommendBlock, /loadAdminFromRequest\(req, 'dispute_recommend'\)/, 'recommend action should be admin-gated');
assert.match(recommendBlock, /from\('dispute_evidence'\)/, 'recommend action should read dispute evidence');
assert.match(recommendBlock, /from\('invoice_meta'\)/, 'recommend action should read invoice terms and proof');
assert.match(recommendBlock, /from\('agent_verifications'\)/, 'recommend action should consider prior agent verification');
assert.match(recommendBlock, /recommendation_decision/, 'recommend action should persist the recommendation decision');
assert.match(recommendBlock, /recommendation_creator_bps/, 'recommend action should persist creator basis points');
assert.match(recommendBlock, /recommendation_client_bps/, 'recommend action should persist client basis points');
assert.match(recommendBlock, /logAdminAction\(admin, 'dispute\.recommend'/, 'recommend action should be audit logged');
assert.doesNotMatch(recommendBlock, /resolveDispute|releaseFunds|approveRelease|payInvoice/, 'recommend action must not move funds');

assert.match(migrationSource, /recommendation_decision/, 'migration should add recommendation decision');
assert.match(migrationSource, /recommendation_creator_bps integer/, 'migration should add creator recommendation bps');
assert.match(migrationSource, /recommendation_client_bps integer/, 'migration should add client recommendation bps');
assert.match(migrationSource, /recommendation_confidence/, 'migration should add recommendation confidence');
assert.match(migrationSource, /verdict_hash_signature/, 'migration should record the verdict hash transaction');
assert.match(migrationSource, /resolution_signature/, 'migration should record the dispute resolution transaction');

assert.match(adminApiSource, /recommendation_decision/, 'admin overview should return recommendation decision');
assert.match(adminApiSource, /recommendation_note/, 'admin overview should return recommendation note');
assert.match(adminApiSource, /recommendation_risks/, 'admin overview should return recommendation risks');
assert.match(adminApiSource, /recommendation_confidence/, 'admin overview should return recommendation confidence');
assert.match(adminApiSource, /token_type/, 'admin overview should return token type for disputes');
assert.match(adminApiSource, /onchain_resolved_at/, 'admin overview should return on-chain resolution status');
assert.match(disputesApiSource, /mark_onchain_resolved/, 'dispute API should record signed on-chain resolution receipts');
assert.match(disputesApiSource, /logAdminAction\(admin, 'dispute\.onchain_resolve'/, 'on-chain receipt recording should be audit logged');

assert.match(sdkSource, /async storeVerdictHash/, 'SDK should expose verdict hash storage');
assert.match(sdkSource, /async resolveDispute/, 'SDK should expose platform dispute resolution');
assert.match(sdkSource, /async resolveDisputeSol/, 'SDK should expose SOL dispute resolution');
assert.match(sdkSource, /PLATFORM_TREASURY/, 'SDK dispute resolution should require the platform treasury signer');
assert.match(sdkSource, /getAssociatedTokenAddressSync\(this\.usdcMint, clientPubkey\)/, 'SDK should resolve the client USDC token account');
assert.match(contractSource, /pub fn resolve_dispute_sol/, 'contract should support SOL dispute resolution');
assert.match(contractSource, /TokenType::SOL/, 'SOL dispute resolution should enforce SOL token type');
assert.match(contractSource, /rent\.minimum_balance\(8 \+ Invoice::LEN\)/, 'SOL dispute resolution should preserve invoice rent exemption');
assert.match(idlSource, /"name": "resolve_dispute_sol"/, 'IDL should expose SOL dispute resolution');

assert.match(adminPageSource, /recommendDispute/, 'admin page should wire recommendation action');
assert.match(adminPageSource, /action:\s*'recommend'/, 'admin page should call the recommend action');
assert.match(adminPageSource, /Recommendation/, 'admin page should show recommendation column or result copy');
assert.match(adminPageSource, /Dispute review/, 'admin page should include a dispute review panel');
assert.match(adminPageSource, /Save decision only/, 'admin page should let admins record a reviewed final decision');
assert.match(adminPageSource, /Resolve and move funds/, 'admin page should include the signed treasury action');
assert.match(adminPageSource, /storeVerdictHash/, 'admin page should store a verdict hash before resolving on-chain');
assert.match(adminPageSource, /resolveDispute\(/, 'admin page should call the SDK on-chain dispute resolver');
assert.match(adminPageSource, /resolveDisputeSol/, 'admin page should call the SOL dispute resolver for SOL invoices');
assert.match(adminPageSource, /USDC or SOL escrow/, 'admin page should describe both on-chain escrow resolution paths');
assert.match(adminPageSource, /creatorShareBps \+ clientShareBps !== 10000/, 'admin page should validate split totals before recording resolution');
assert.match(adminPageSource, /Select a dispute row again before recording the final decision/, 'final decision action should explain missing dispute selection');
assert.match(adminPageSource, /Select a dispute row again before signing the on-chain resolution/, 'on-chain action should explain missing dispute selection');
assert.match(adminPageSource, /role="status" aria-live="polite"/, 'dispute review panel should show action status near the buttons');

console.log('dispute recommendation tests passed');
