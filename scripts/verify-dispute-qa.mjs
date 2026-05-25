import { spawnSync } from 'node:child_process';

const tests = [
  'tests/disputeApiValidation.test.mjs',
  'tests/disputeRecommendation.test.mjs',
  'tests/schemaConstraints.test.mjs',
  'tests/securityHeaders.test.mjs',
  'tests/trustBoundaryHardening.test.mjs',
];

for (const test of tests) {
  const result = spawnSync(process.execPath, [test], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Dispute QA verification passed');
