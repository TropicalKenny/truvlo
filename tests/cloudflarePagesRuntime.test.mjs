import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const functionsFile = readFileSync(join(root, 'functions/api/[[path]].ts'), 'utf8');
const wranglerConfig = readFileSync(join(root, 'wrangler.toml'), 'utf8');
const redirects = readFileSync(join(root, 'public/_redirects'), 'utf8');
const headers = readFileSync(join(root, 'public/_headers'), 'utf8');

const publicApiFiles = readdirSync(join(root, 'api'))
  .filter((file) => file.endsWith('.ts'))
  .filter((file) => !file.startsWith('_'))
  .map((file) => file.replace(/\.ts$/, ''));

for (const routeName of publicApiFiles) {
  const routeDeclaration = "'" + routeName + "': () => import('../../api/" + routeName + ".js')";
  assert.ok(functionsFile.includes(routeDeclaration), 'Cloudflare Pages runtime must map api/' + routeName + '.ts');
}

for (const endpoint of [
  'agent-verifications',
  'agent-policies',
  'devnet-agent-actions',
  'x402-escrow-intent',
  'telegram-link',
  'telegram-webhook',
]) {
  assert.ok(functionsFile.includes("'" + endpoint + "': '" + endpoint + "'"), 'Missing agent rewrite ' + endpoint);
}

assert.match(functionsFile, /applyEnvironment\(context\.env\);/, 'Cloudflare env must be applied before importing handlers');
assert.match(functionsFile, /const mod = await loader\(\);/, 'Handlers must be loaded after env is applied');
assert.match(functionsFile, /searchParams\.set\('agentEndpoint'/, 'Agent rewrites must preserve the existing Vercel query contract');
assert.match(functionsFile, /class PagesResponse/, 'Runtime must emulate the Vercel response object used by API handlers');

assert.match(wranglerConfig, /pages_build_output_dir = "dist"/, 'Wrangler config must publish the Vite dist directory');
assert.match(wranglerConfig, /nodejs_compat/, 'Cloudflare runtime needs Node compatibility for existing Vercel-style handlers');
assert.match(redirects, /\/\* \/index\.html 200/, 'SPA fallback must be configured for Cloudflare Pages');
assert.match(headers, /Content-Security-Policy:/, 'Cloudflare Pages must keep security headers');
assert.match(headers, /X-Content-Type-Options: nosniff/, 'Cloudflare Pages must keep content-type hardening');

console.log('cloudflarePagesRuntime checks passed');

