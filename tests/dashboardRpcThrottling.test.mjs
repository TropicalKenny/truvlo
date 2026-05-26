import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sdkSource = await readFile('src/lib/escrowPaySDK.ts', 'utf8');
const dashboardSource = await readFile('src/components/Dashboard.tsx', 'utf8');

const programAccountScans = sdkSource.match(/getProgramAccounts\(this\.programId/g) ?? [];

assert.equal(
  programAccountScans.length,
  1,
  'invoice listing should share one program-account scan instead of scanning separately for creator and client views'
);
assert.match(
  sdkSource,
  /invoiceAccountsPromise/,
  'invoice listing should share an in-flight scan across concurrent dashboard requests'
);
assert.match(
  sdkSource,
  /clearInvoiceAccountsCache\(\)/,
  'dashboard should be able to force a fresh scan after on-chain actions'
);
assert.match(
  dashboardSource,
  /if \(forceNetwork\) sdk\.clearInvoiceAccountsCache\(\)/,
  'normal dashboard loads should keep the invoice scan cache instead of clearing it every time'
);
assert.match(
  dashboardSource,
  /fetchAll\(false, true\)/,
  'on-chain dashboard actions should force a fresh invoice scan after state changes'
);
assert.match(
  sdkSource,
  /invoiceAccountsRateLimitedUntil/,
  'invoice listing should back off after public devnet RPC rate limits'
);
assert.match(
  dashboardSource,
  /Solana devnet RPC is rate limited/,
  'dashboard should show a specific recoverable message for devnet RPC rate limits'
);

console.log('dashboard RPC throttling tests passed');
