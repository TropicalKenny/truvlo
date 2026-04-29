import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/CreateInvoiceForm.tsx', 'utf8');

const amountInputStart = source.indexOf('id="invoiceAmount"');
assert.notEqual(amountInputStart, -1, 'amount input should use a specific non-generic id');

const amountInputEnd = source.indexOf('/>', amountInputStart);
const amountInput = source.slice(amountInputStart, amountInputEnd);

assert.match(amountInput, /type="text"/, 'amount input should not be a browser-managed number field');
assert.match(amountInput, /inputMode="decimal"/, 'amount input should still open decimal keyboards');
assert.match(amountInput, /name="invoiceAmount"/, 'amount input name should avoid generic autofill keys');
assert.doesNotMatch(amountInput, /type="number"/, 'amount input should not render number spinners');

console.log('create invoice form tests passed');
