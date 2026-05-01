import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const hero = await readFile('src/components/Hero.tsx', 'utf8');
const features = await readFile('src/components/Features.tsx', 'utf8');
const dashboard = await readFile('src/components/Dashboard.tsx', 'utf8');
const css = await readFile('src/index.css', 'utf8');
const touchedSources = [
  'src/components/Hero.tsx',
  'src/components/Features.tsx',
  'src/components/Dashboard.tsx',
  'src/components/InvoicePayment.tsx',
  'src/components/ApproveRelease.tsx',
  'src/components/WalletOnboarding.tsx',
  'src/pages/PaymentPage.tsx',
  'src/pages/ApprovePage.tsx',
  'src/pages/CreateInvoicePage.tsx',
  'src/pages/OnboardingPage.tsx',
  'src/pages/WalletPage.tsx',
];

for (const status of ['Created', 'In escrow', 'Requested', 'Approved', 'Withdrawn']) {
  assert.match(hero, new RegExp(status), `hero lifecycle should include ${status}`);
}

assert.match(hero, /statusClass/, 'hero lifecycle should use semantic status classes');
assert.match(hero, /trust-status \$\{item\.statusClass\}/, 'hero should render lifecycle status classes dynamically');
assert.match(hero, /Escrow invoices clients can trust/, 'hero should keep the accepted headline');
assert.match(
  hero,
  /Real invoice states, client approvals, and managed dispute records in one ledger/,
  'hero should state the Trust Ledger framing',
);

assert.match(features, /ledgerRules/, 'features should be a ledger rules surface, not a generic card grid');
assert.match(features, /grid-cols-\[1\.15fr_0\.7fr_1\.35fr_1\.35fr\]/, 'features should use table-like ledger columns on desktop');
assert.match(features, /No hidden arbitration promise/, 'features should avoid claiming decentralized arbitration');

assert.match(dashboard, /trust-dashboard-grid/, 'dashboard should keep the Trust Ledger dashboard grid');
assert.match(dashboard, /trust-ledger-row/, 'dashboard invoices should render as ledger rows');
assert.match(dashboard, /trust-ledger-heading/, 'dashboard should include desktop ledger headings');
assert.match(dashboard, /trust-panel-subtle/, 'dashboard should use shared subtle panels');
assert.match(dashboard, /Client approved - ready to withdraw/, 'creator release copy should explicitly tie readiness to client approval');
assert.match(dashboard, /You approved this withdrawal/, 'client history should show approval state');

assert.match(css, /\.trust-tabs\s*\{[\s\S]*overflow-x:\s*auto/, 'trust tabs should scroll horizontally');
assert.match(css, /\.trust-tabs\s*\{[\s\S]*overflow-y:\s*hidden/, 'trust tabs should block vertical overflow');
assert.match(css, /\.trust-tabs\s*\{[\s\S]*touch-action:\s*pan-x/, 'trust tabs should use horizontal touch action');
assert.match(css, /\.trust-tabs\s*\{[\s\S]*overscroll-behavior-y:\s*none/, 'trust tabs should avoid vertical bounce');
assert.match(css, /\.trust-tabs \[role="tab"\]\s*\{[\s\S]*white-space:\s*nowrap/, 'trust tab labels should not wrap');
assert.match(css, /\.trust-form-card/, 'public form surfaces should use shared Trust Ledger form cards');
assert.match(css, /\.trust-ledger-row/, 'shared CSS should define ledger row layout');

for (const file of touchedSources) {
  const source = await readFile(file, 'utf8');
  assert.doesNotMatch(source, /�|Â|â/, `${file} should not contain mojibake`);
}

console.log('trust ledger phase 2 tests passed');
