import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const metaApiSource = await readFile('api/create-invoice-meta.ts', 'utf8');
const emailHelperSource = await readFile('api/_email.ts', 'utf8');
const notifyClientSource = await readFile('api/notify-client.ts', 'utf8');
const notifyCreatorSource = await readFile('api/notify-creator.ts', 'utf8');
const sendInvoiceSource = await readFile('api/send-invoice.ts', 'utf8');
const formSource = await readFile('src/components/CreateInvoiceForm.tsx', 'utf8');

assert.match(
  metaApiSource,
  /PUBLIC_EMAIL_DELIVERY_ERROR/,
  'invoice metadata API should return a friendly email delivery error',
);
assert.doesNotMatch(metaApiSource, /resend_error/, 'invoice metadata API should not return provider error details');
assert.match(emailHelperSource, /onboarding@resend\.dev/, 'shared email helper should support Resend test sender while no domain is configured');
assert.match(emailHelperSource, /PUBLIC_EMAIL_DELIVERY_ERROR/, 'shared email helper should provide client-friendly email failure copy');
for (const [name, source] of [
  ['notify-client', notifyClientSource],
  ['notify-creator', notifyCreatorSource],
  ['send-invoice', sendInvoiceSource],
]) {
  assert.doesNotMatch(source, /verified sender domain/, `${name} should not expose sender-domain setup details`);
  assert.match(source, /PUBLIC_EMAIL_DELIVERY_ERROR/, `${name} should return friendly email delivery copy`);
}
assert.doesNotMatch(formSource, /meta\.resend_error/, 'create invoice form should not expose provider errors');
assert.doesNotMatch(formSource, /verified sender domain/, 'create invoice form should not expose sender-domain setup details');
assert.match(formSource, /Email was not delivered automatically/, 'create invoice form should use client-friendly fallback copy');

console.log('invoice email config tests passed');
