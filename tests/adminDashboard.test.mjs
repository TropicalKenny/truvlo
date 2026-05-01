import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('src/App.tsx', 'utf8');
const adminPageSource = await readFile('src/pages/AdminPage.tsx', 'utf8');
const adminApiSource = await readFile('api/admin-overview.ts', 'utf8');
const adminLibSource = await readFile('src/lib/admin.ts', 'utf8');
const adminHelperSource = await readFile('api/_admin.ts', 'utf8');
const adminAlertsSource = await readFile('api/_admin-alerts.ts', 'utf8');
const disputesApiSource = await readFile('api/disputes.ts', 'utf8');
const approveReleaseSource = await readFile('src/components/ApproveRelease.tsx', 'utf8');
const dashboardSource = await readFile('src/components/Dashboard.tsx', 'utf8');
const adminMigrationSource = await readFile('supabase/migrations/20260501_zero_trust_admin_roles.sql', 'utf8');

assert.match(
  adminLibSource,
  /WEB_ADMIN_WALLET_ADDRESS = 'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn'/,
  'web admin wallet should use the operator-controlled admin wallet',
);
assert.match(
  adminLibSource,
  /CONTRACT_PLATFORM_TREASURY_WALLET = 'A42JPkaVHZC7NkucsX8L2v7vg82xLZ2nkLqA8w6XH6cn'/,
  'contract platform treasury wallet should use the operator-controlled admin wallet',
);
assert.match(
  appSource,
  /path="\/admin"\s+element=\{<OnboardingGate><AdminPage\s*\/><\/OnboardingGate>\}/,
  'admin page should be a private onboarded route',
);
assert.doesNotMatch(adminPageSource, /isAdminWallet/, 'admin page should not use the old one-wallet UI gate as its security boundary');
assert.match(adminPageSource, /Read-only operations/, 'admin page should clearly identify the first version as read-only');
assert.match(adminPageSource, /\/api\/admin-overview\?wallet=/, 'admin page should load server-verified admin data');
assert.match(adminPageSource, /Unauthorized/, 'admin page should show unauthorized state for non-admin wallets');
assert.match(adminPageSource, /type AdminSectionId/, 'admin page should define explicit selectable admin sections');
assert.match(adminPageSource, /visibleSections\.map\(section =>/, 'admin page should render section navigation from the server-allowed section config');
assert.match(adminPageSource, /activeSectionId/, 'admin page should track the active admin section');
assert.match(adminPageSource, /window\.history\.replaceState\(null, '', `#\$\{sectionId\}`\)/, 'admin page should update the hash for direct section links');
assert.match(adminPageSource, /role="tablist"/, 'admin page should expose the section switcher as tabs');
assert.match(adminPageSource, /aria-pressed=\{active\}/, 'admin stat cards should behave as selectable navigation');
assert.match(adminPageSource, /rows=\{activeRows\}/, 'admin page should render only the selected section data panel');
assert.match(adminPageSource, /visibleSections/, 'admin page should render only server-allowed sections');
assert.match(adminPageSource, /allowed_sections/, 'admin page should consume server-provided section permissions');
assert.match(adminPageSource, /admin-role-badge/, 'admin page should show the current admin role');
assert.match(adminPageSource, /reconcile_disputes/, 'owner admin should be able to trigger dispute reconciliation');

assert.match(adminApiSource, /requireAdmin/, 'admin API should use the shared DB-backed admin gate');
assert.match(adminApiSource, /redactRows/, 'admin API should redact rows server-side for limited roles');
assert.match(adminApiSource, /maskIdentifier|maskEmail|shortWallet/, 'admin API should mask sensitive fields before responding');
assert.match(adminApiSource, /allowed_sections/, 'admin API should return allowed sections explicitly');
assert.match(adminApiSource, /from\('invoice_meta'\)/, 'admin API should include invoice metadata');
assert.match(adminApiSource, /from\('dispute_cases'\)/, 'admin API should include dispute cases');
assert.match(adminApiSource, /from\('referral_rewards'\)/, 'admin API should include referral rewards');
assert.match(adminApiSource, /from\('payout_requests'\)/, 'admin API should include payout requests');
assert.match(adminApiSource, /dispute_backfill/, 'admin API should gate dispute reconciliation behind owner permission');

assert.match(adminHelperSource, /type AdminRole = 'owner' \| 'dispute_admin' \| 'payout_admin' \| 'support_admin'/, 'admin helper should define least-privilege roles');
assert.match(adminHelperSource, /requireUserId/, 'admin helper should require Privy authentication');
assert.match(adminHelperSource, /ROLE_SECTIONS/, 'admin helper should map roles to allowed sections');
assert.match(adminHelperSource, /hasAdminPermission/, 'admin helper should deny permissions not granted to a role');
assert.match(adminHelperSource, /from\('admin_members'\)/, 'admin helper should authorize against admin_members');
assert.match(adminHelperSource, /walletBelongsToUser/, 'admin helper should verify wallet ownership');
assert.match(adminHelperSource, /logAdminAction/, 'admin helper should expose audit logging');

assert.match(adminMigrationSource, /create table if not exists admin_members/, 'migration should create admin_members');
assert.match(adminMigrationSource, /create table if not exists admin_audit_log/, 'migration should create admin_audit_log');
assert.match(adminMigrationSource, /alter table admin_members enable row level security/, 'admin_members should have RLS enabled');
assert.match(adminMigrationSource, /role in \('owner', 'dispute_admin', 'payout_admin', 'support_admin'\)/, 'admin role values should be constrained');

assert.match(disputesApiSource, /sendDisputeAdminAlerts/, 'dispute API should alert admins when a dispute case is opened');
assert.match(disputesApiSource, /already_exists/, 'duplicate dispute opens should be treated as success');
assert.match(approveReleaseSource, /fetch\('\/api\/disputes'/, 'approve release flow should record off-chain dispute cases');
assert.match(dashboardSource, /fetch\('\/api\/disputes'/, 'dashboard dispute flow should record off-chain dispute cases');
assert.match(adminAlertsSource, /ADMIN_ALERT_WEBHOOK_URL/, 'admin alerts should support a webhook destination');
assert.match(adminAlertsSource, /dispute_alerts_enabled/, 'admin alerts should respect dispute alert settings');
assert.match(adminAlertsSource, /shortWallet/, 'admin webhook payload should avoid full sensitive wallet exposure');

console.log('admin dashboard tests passed');
