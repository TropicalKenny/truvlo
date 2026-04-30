import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  ['src/components/Header.tsx', 'Header'],
  ['src/components/Hero.tsx', 'Hero'],
  ['src/components/Features.tsx', 'Features'],
  ['src/pages/Index.tsx', 'Index'],
];

for (const [path, label] of files) {
  const source = await readFile(path, 'utf8');
  assert.match(source, /ready/, `${label} should read Privy ready`);
  assert.match(source, /!ready|ready &&|ready \?/, `${label} should gate auth UI or redirects behind ready`);
}

console.log('auth ready gating tests passed');
