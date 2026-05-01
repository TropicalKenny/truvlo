import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const clipboardSource = await readFile('src/lib/clipboard.ts', 'utf8');
const headerSource = await readFile('src/components/Header.tsx', 'utf8');

assert.match(clipboardSource, /navigator\.clipboard\?\.writeText/, 'clipboard helper should use the native clipboard API when available');
assert.match(clipboardSource, /document\.execCommand\('copy'\)/, 'clipboard helper should fall back for mobile and in-app browsers');
assert.match(clipboardSource, /document\.createElement\('textarea'\)/, 'clipboard fallback should copy via a temporary textarea');
assert.match(headerSource, /copyTextToClipboard\(address\)/, 'header copy address action should use the shared robust clipboard helper');
assert.match(headerSource, /Could not copy address/, 'header should show a friendly failure message when copying is blocked');

console.log('clipboard fallback tests passed');
