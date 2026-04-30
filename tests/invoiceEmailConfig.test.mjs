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
  /isResendTestSender/,
  'invoice metadata API should explicitly detect resend.dev test sender configuration',
);
assert.match(
  metaApiSource,
  /verified sender domain/,
  'invoice metadata API should return a clear verified-domain configuration error',
);
assert.match(
  metaApiSource,
  /resend_error/,
  'invoice metadata API should include provider error detail when Resend rejects a send',
);
assert.match(emailHelperSource, /notifications@truvlo\.io/, 'shared email helper should default to a Truvlo sender');
assert.doesNotMatch(emailHelperSource, /onboarding@resend\.dev/, 'shared email helper should not default to Resend test sender');
for (const [name, source] of [
  ['notify-client', notifyClientSource],
  ['notify-creator', notifyCreatorSource],
  ['send-invoice', sendInvoiceSource],
]) {
  assert.doesNotMatch(source, /onboarding@resend\.dev/, `${name} should not default to Resend test sender`);
  assert.match(source, /isResendTestSender/, `${name} should guard against @resend.dev sender configuration`);
}
assert.match(
  formSource,
  /meta\.resend_error/,
  'create invoice form should surface the concrete email provider error when available',
);
assert.match(
  formSource,
  /Email setup needs a verified sender domain/,
  'create invoice form should show clear setup copy for sender-domain failures',
);

console.log('invoice email config tests passed');
