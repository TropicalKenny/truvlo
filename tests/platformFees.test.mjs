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

const { calculatePlatformFeeBreakdown } = await importTs('src/lib/platformFees.ts');

assert.deepEqual(
  calculatePlatformFeeBreakdown({ amount: 100, tokenType: 'USDC' }),
  { platformFee: 2, totalPayable: 102, feePercentage: 2, feeLabel: 'Platform Fee ($2 flat)' },
);

assert.deepEqual(
  calculatePlatformFeeBreakdown({ amount: 250, tokenType: 'USDC' }),
  { platformFee: 2.5, totalPayable: 252.5, feePercentage: 1, feeLabel: 'Platform Fee (1%)' },
);

assert.equal(
  calculatePlatformFeeBreakdown({ amount: 1, tokenType: 'SOL' }),
  null,
  'SOL fees must not fall back to 1% when price is unavailable',
);

assert.deepEqual(
  calculatePlatformFeeBreakdown({ amount: 1, tokenType: 'SOL', solPriceUsd: 150 }),
  {
    platformFee: 0.013333333,
    totalPayable: 1.013333333,
    feePercentage: 1.3333333,
    feeLabel: 'Platform Fee ($2 flat)',
  },
);

assert.deepEqual(
  calculatePlatformFeeBreakdown({ amount: 2, tokenType: 'SOL', solPriceUsd: 150 }),
  { platformFee: 0.02, totalPayable: 2.02, feePercentage: 1, feeLabel: 'Platform Fee (1%)' },
);

console.log('platform fee tests passed');
