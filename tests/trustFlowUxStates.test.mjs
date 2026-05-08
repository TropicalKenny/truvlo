import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile('src/components/Dashboard.tsx', 'utf8');
const invoicePayment = await readFile('src/components/InvoicePayment.tsx', 'utf8');
const walletOnboarding = await readFile('src/components/WalletOnboarding.tsx', 'utf8');
const walletPage = await readFile('src/pages/WalletPage.tsx', 'utf8');
const evidencePage = await readFile('src/pages/DisputeEvidencePage.tsx', 'utf8');

assert.match(dashboard, /isInvoicePaidByAgent/, 'dashboard should derive agent-paid state through a helper');
assert.match(dashboard, /inv\.client\.toBase58\(\) === policy\.agent_wallet/, 'agent-paid state should require the invoice client to be the agent wallet');
assert.match(dashboard, /Paid by Truvlo Agent on client's behalf/, 'creator rows should label agent-paid invoices');
assert.match(dashboard, /Paid by Truvlo Agent on your behalf/, 'client rows should label agent-paid invoices');
assert.match(dashboard, /Payment source[\s\S]*Truvlo Agent/, 'selected record panel should show payment source');
assert.match(dashboard, /Client approval pending/, 'dashboard should use concrete approval-pending copy');
assert.match(dashboard, /Proof submitted/, 'creator rows should replace submit proof after proof submission');
assert.match(dashboard, /Submit evidence/, 'disputed rows should expose submit evidence action');
assert.match(dashboard, /Evidence due/, 'disputed rows and detail panel should expose evidence due state');
assert.match(dashboard, /openEvidencePage/, 'dispute actions should route to the evidence page');
assert.match(dashboard, /window\.open\(url, '_blank', 'noopener,noreferrer'\)/, 'invoice links opened in new tabs should block opener access');
assert.doesNotMatch(dashboard, /Agent working|Awaiting client|Submitting\.\.\./, 'dashboard should avoid ambiguous/premature action copy');

assert.match(invoicePayment, /paidByAgent: true/, 'agent payment success should carry paidByAgent');
assert.match(invoicePayment, /paidByAgent: false/, 'manual payment success should carry non-agent source');
assert.match(invoicePayment, /Payment source/, 'invoice success state should display payment source');
assert.match(invoicePayment, /Paid by Truvlo Agent on your behalf/, 'invoice success state should label agent-paid payment');
assert.match(invoicePayment, /Agent payment pending/, 'agent payment button should use concrete pending copy');
assert.doesNotMatch(invoicePayment, /Agent working/, 'invoice payment should avoid ambiguous agent-working copy');

assert.match(walletOnboarding, /Create secure Truvlo wallet/, 'wallet onboarding should make secure Truvlo wallet primary');
assert.match(walletOnboarding, /Advanced import/, 'wallet onboarding should demote import to advanced');
assert.match(walletOnboarding, /Private keys and seed phrases control the wallet/, 'wallet onboarding should warn about key material');
assert.match(walletPage, /Advanced import/, 'wallet page should demote import to advanced');
assert.match(walletPage, /Private keys and seed phrases control the wallet/, 'wallet page should warn about key material');

assert.match(evidencePage, /Evidence due/, 'evidence page should show evidence deadline');

console.log('trust flow UX state tests passed');
