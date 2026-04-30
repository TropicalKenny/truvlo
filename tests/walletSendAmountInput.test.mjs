import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/pages/WalletPage.tsx', 'utf8');

const amountInputStart = source.indexOf('id="sendAmount"');
assert.notEqual(amountInputStart, -1, 'wallet send amount input should have a stable sendAmount id');

const amountInputEnd = source.indexOf('/>', amountInputStart);
const amountInput = source.slice(amountInputStart, amountInputEnd);

assert.match(amountInput, /type="text"/, 'wallet send amount input should not use browser-managed number fields');
assert.match(amountInput, /inputMode="decimal"/, 'wallet send amount input should open decimal keyboards on mobile');
assert.match(amountInput, /name="sendAmount"/, 'wallet send amount input should keep a stable non-generic name');
assert.doesNotMatch(amountInput, /type="number"/, 'wallet send amount input should not render number spinners');
assert.match(source, /sanitizeSendAmountInput/, 'wallet send amount input should sanitize token-aware decimal precision');

console.log('wallet send amount input tests passed');
