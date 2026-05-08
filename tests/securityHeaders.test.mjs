import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const vercelConfig = JSON.parse(await readFile('vercel.json', 'utf8'));
const allHeaders = vercelConfig.headers?.flatMap(entry => entry.headers ?? []) ?? [];
const headerByKey = new Map(allHeaders.map(header => [header.key.toLowerCase(), header.value]));
const csp = headerByKey.get('content-security-policy') ?? '';

assert.ok(csp, 'Vercel config should define Content-Security-Policy');
assert.match(csp, /default-src 'self'/, 'CSP should default to self');
assert.match(csp, /base-uri 'self'/, 'CSP should restrict base URI');
assert.match(csp, /object-src 'none'/, 'CSP should block plugins');
assert.match(csp, /frame-ancestors 'none'/, 'CSP should block clickjacking at CSP layer');
assert.match(csp, /form-action 'self'/, 'CSP should restrict form submissions');
assert.match(csp, /script-src 'self' 'sha256-/, 'script-src should use a hash for inline JSON-LD instead of unsafe-inline');
assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/, 'script-src should not allow unsafe-inline');
assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/, 'style-src keeps inline styles needed by the current React UI');
assert.match(csp, /upgrade-insecure-requests/, 'CSP should upgrade insecure subresource requests in production');

assert.equal(headerByKey.get('x-content-type-options'), 'nosniff', 'Vercel config should set nosniff');
assert.equal(headerByKey.get('x-frame-options'), 'DENY', 'Vercel config should set X-Frame-Options');
assert.equal(headerByKey.get('referrer-policy'), 'strict-origin-when-cross-origin', 'Vercel config should set referrer policy');
assert.match(headerByKey.get('permissions-policy') ?? '', /camera=\(\), microphone=\(\), geolocation=\(\)/, 'Vercel config should restrict sensitive browser permissions');

console.log('security header tests passed');
