import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/Dashboard.tsx', 'utf8');

assert.match(source, /clientInvoiceMeta/, 'dashboard should cache client invoice metadata');
assert.match(source, /loadClientInvoiceMeta/, 'dashboard should load creator names for client invoices');
assert.match(source, /\/api\/create-invoice-meta\?/, 'dashboard should use existing invoice metadata API');
assert.match(source, /From:/, 'client cards should label invoice creators as From');
assert.match(source, /creatorName \|\| truncateWallet/, 'client creator name should fall back to shortened creator wallet');
assert.match(source, /overflowY:\s*'hidden'/, 'dashboard tabs should hide vertical overflow on mobile');
assert.match(source, /touchAction:\s*'pan-x'/, 'dashboard tabs should only pan horizontally');

console.log('dashboard client creator name tests passed');
