import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const prefetchSource = await readFile('src/lib/routePrefetch.ts', 'utf8');
const headerSource = await readFile('src/components/Header.tsx', 'utf8');
const appSource = await readFile('src/App.tsx', 'utf8');

assert.match(prefetchSource, /preloadRoute/, 'route prefetch helper should expose preloadRoute');
assert.match(prefetchSource, /import\('\.\.\/pages\/DashboardPage'\)/, 'dashboard route should be preloaded from helper');
assert.match(headerSource, /preloadRoute/, 'header should preload authenticated nav routes');
assert.match(headerSource, /onMouseEnter/, 'desktop nav should prefetch on hover');
assert.match(headerSource, /onFocus/, 'keyboard focus should prefetch routes too');
assert.match(appSource, /lazy\(\(\) => import\('\.\/pages\/DashboardPage'\)\)/, 'dashboard should remain behind a lazy route chunk');
assert.match(appSource, /lazy\(\(\) => import\('\.\/pages\/WalletPage'\)\)/, 'wallet should remain behind a lazy route chunk');

console.log('route prefetch tests passed');
