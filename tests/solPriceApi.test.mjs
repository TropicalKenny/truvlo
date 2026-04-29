import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const apiSource = await readFile('api/sol-price.ts', 'utf8').catch(() => '');
const paymentSource = await readFile('src/components/InvoicePayment.tsx', 'utf8');

assert.match(apiSource, /CACHE_TTL_MS/);
assert.match(apiSource, /AbortSignal\.timeout/);
assert.match(apiSource, /hermes\.pyth\.network/);
assert.match(apiSource, /Cache-Control/);
assert.match(paymentSource, /fetch\('\/api\/sol-price'\)/);
assert.doesNotMatch(paymentSource, /readOnlySdk\.getSolPriceUsd\(\)/);

console.log('sol price API tests passed');
