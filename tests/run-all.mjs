import { readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const testsDir = path.resolve('tests');
const files = (await readdir(testsDir))
  .filter(file => file.endsWith('.test.mjs'))
  .sort();

let passed = 0;
for (const file of files) {
  const fullPath = path.join(testsDir, file);
  await import(pathToFileURL(fullPath).href);
  passed += 1;
}

console.log(`All ${passed} source tests passed`);
