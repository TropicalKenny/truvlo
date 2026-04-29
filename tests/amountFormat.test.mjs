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

const { formatTokenAmount, formatTokenAmountValue } = await importTs('src/lib/amountFormat.ts');

assert.equal(formatTokenAmount(2, 'USDC'), '2 USDC');
assert.equal(formatTokenAmount(2.5, 'USDC'), '2.5 USDC');
assert.equal(formatTokenAmount(2.1234567, 'USDC'), '2.123457 USDC');
assert.equal(formatTokenAmount(0.0001, 'SOL'), '0.0001 SOL');
assert.equal(formatTokenAmount(1.230000000, 'SOL'), '1.23 SOL');
assert.equal(formatTokenAmount(0.024119682, 'SOL'), '0.02412 SOL');
assert.equal(formatTokenAmount(1.024119682, 'SOL'), '1.02412 SOL');
assert.equal(formatTokenAmount(0.000000123, 'SOL'), '0.000000123 SOL');
assert.equal(formatTokenAmountValue(0, 'USDC'), '0');

console.log('amountFormat tests passed');
