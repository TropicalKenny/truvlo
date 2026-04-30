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

const { resolveAppOrigin } = await importTs('api/_notify-client-origin.ts');

assert.equal(
  resolveAppOrigin({
    envOrigin: 'https://app.truvlo.io/',
    headers: {},
  }),
  'https://app.truvlo.io',
);

assert.equal(
  resolveAppOrigin({
    envOrigin: undefined,
    headers: { 'x-forwarded-proto': 'https', host: 'truvlo.io' },
  }),
  'https://truvlo.io',
);

assert.equal(
  resolveAppOrigin({
    envOrigin: undefined,
    vercelUrl: 'truvlo-git-main.vercel.app',
    headers: {},
  }),
  'https://truvlo-git-main.vercel.app',
);

assert.equal(
  resolveAppOrigin({
    envOrigin: undefined,
    headers: { origin: 'https://preview.truvlo.io' },
  }),
  'https://preview.truvlo.io',
);

console.log('notify-client origin tests passed');
