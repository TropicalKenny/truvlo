import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function importTs(path) {
  const source = await readFile(path, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
}

const { isReferralRewardWindowActive } = await importTs('src/lib/referralEligibility.ts');

const linkedAt = '2026-01-01T00:00:00.000Z';

assert.equal(
  isReferralRewardWindowActive(linkedAt, new Date('2026-12-31T23:59:59.000Z')),
  true,
  'referrals should qualify before the one-year window expires',
);
assert.equal(
  isReferralRewardWindowActive(linkedAt, new Date('2027-01-01T00:00:00.000Z')),
  true,
  'referrals should qualify through the exact one-year anniversary',
);
assert.equal(
  isReferralRewardWindowActive(linkedAt, new Date('2027-01-01T00:00:01.000Z')),
  false,
  'referrals should stop qualifying after one year',
);
assert.equal(
  isReferralRewardWindowActive(null, new Date('2026-01-02T00:00:00.000Z')),
  false,
  'missing referral_linked_at should not qualify rewards',
);
assert.equal(
  isReferralRewardWindowActive('not-a-date', new Date('2026-01-02T00:00:00.000Z')),
  false,
  'invalid referral_linked_at should not qualify rewards',
);

console.log('referral eligibility tests passed');
