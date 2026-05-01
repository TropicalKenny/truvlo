import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/components/InvoicePayment.tsx', 'utf8');

assert.match(
  source,
  /getClientPaymentErrorMessage/,
  'invoice payment should centralize client-facing payment error copy',
);
assert.match(
  source,
  /Your wallet needs more \$\{token\} for this payment and network fees/,
  'insufficient funds copy should clearly tell the client what is missing and mention fees',
);
assert.match(
  source,
  /Add funds to the wallet connected here, then try again/,
  'insufficient funds copy should give the client a clear next step',
);
assert.doesNotMatch(
  source,
  /description:\s*msg/,
  'invoice payment should not pass raw transaction error copy into the toast',
);
assert.match(
  source,
  /title:\s*'Payment not completed'/,
  'invoice payment should use softer client-facing failure title',
);

console.log('invoice payment error copy tests passed');
