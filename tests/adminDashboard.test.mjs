import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('src/App.tsx', 'utf8');
const adminPageSource = await readFile('src/pages/AdminPage.tsx', 'utf8');
const adminApiSource = await readFile('api/admin-overview.ts', 'utf8');
const adminLibSource = await readFile('src/lib/admin.ts', 'utf8');

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
assert.match(adminPageSource, /isAdminWallet/, 'admin page should gate UI by active admin wallet');
assert.match(adminPageSource, /Read-only operations/, 'admin page should clearly identify the first version as read-only');
assert.match(adminPageSource, /\/api\/admin-overview\?wallet=/, 'admin page should load server-verified admin data');
assert.match(adminPageSource, /Unauthorized/, 'admin page should show unauthorized state for non-admin wallets');

assert.match(adminApiSource, /requireUserId/, 'admin API should require Privy authentication');
assert.match(adminApiSource, /walletBelongsToUser/, 'admin API should verify the admin wallet belongs to the user');
assert.match(adminApiSource, /WEB_ADMIN_WALLET_ADDRESS/, 'admin API should compare against the shared web admin wallet constant');
assert.match(adminApiSource, /from\('invoice_meta'\)/, 'admin API should include invoice metadata');
assert.match(adminApiSource, /from\('dispute_cases'\)/, 'admin API should include dispute cases');
assert.match(adminApiSource, /from\('referral_rewards'\)/, 'admin API should include referral rewards');
assert.match(adminApiSource, /from\('payout_requests'\)/, 'admin API should include payout requests');
assert.doesNotMatch(adminPageSource, /method:\s*'POST'|method:\s*"POST"/, 'admin page phase 1 should not perform write actions');

console.log('admin dashboard tests passed');
