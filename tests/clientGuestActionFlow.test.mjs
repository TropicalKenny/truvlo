import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const appSource = await readFile('src/App.tsx', 'utf8');
const approveSource = await readFile('src/components/ApproveRelease.tsx', 'utf8');
const paymentSource = await readFile('src/components/InvoicePayment.tsx', 'utf8');
const notifyClientSource = await readFile('api/notify-client.ts', 'utf8');

assert.match(
  appSource,
  /path="\/approve\/:invoiceId\/:creator"\s+element=\{<ApprovePage\s*\/>\}/,
  'approve route should be public and not wrapped in OnboardingGate',
);

assert.match(
  notifyClientSource,
  /\/approve\/\$\{encodeURIComponent\(invoiceId\)\}\/\$\{encodeURIComponent\(normalizedCreatorWallet\)\}/,
  'withdrawal notification approve URL should include invoice id and creator wallet',
);

assert.match(approveSource, /Continue as client to approve or dispute/, 'approve page should use guest client wording');
assert.match(approveSource, /No Truvlo profile setup needed/, 'approve page should explain client onboarding is not required');
assert.match(approveSource, /This invoice was paid by another wallet/, 'approve page should explain wrong-wallet state');
assert.match(approveSource, /connectedWalletMatchesClient/, 'approve page should derive same-wallet client authorization before actions');
assert.match(
  approveSource,
  /disabled=\{approving \|\| disputing \|\| !connectedWalletMatchesClient\}/,
  'approve and dispute actions should be disabled unless the connected wallet matches the invoice client wallet',
);

assert.match(paymentSource, /Continue as client/, 'invoice payment should use client guest wording before login');
assert.match(paymentSource, /Pay securely/, 'invoice payment should use payment-focused CTA copy after wallet connection');
assert.match(
  paymentSource,
  /Use this same wallet to approve releases or raise a dispute later/,
  'payment success should tell clients to use the same wallet for future release/dispute actions',
);

console.log('client guest action flow tests passed');
