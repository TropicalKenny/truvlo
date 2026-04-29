import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/pages/ProfileSettingsPage.tsx', 'utf8');

assert.match(source, /const \[copiedReferralCode, setCopiedReferralCode\]/);
assert.match(source, /setCopiedReferralCode\(true\)/);
assert.match(source, /copiedReferralCode \? 'Copied' : 'Copy'/);
assert.match(source, /const isDirty\s*=/);
assert.match(source, /!loading && isDirty &&/);
assert.match(source, /const resetForm = /);

console.log('profile settings UI tests passed');
