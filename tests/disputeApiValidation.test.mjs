import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const disputesApi = await readFile('api/disputes.ts', 'utf8');
const dashboard = await readFile('src/components/Dashboard.tsx', 'utf8');
const evidencePage = await readFile('src/pages/DisputeEvidencePage.tsx', 'utf8');

assert.match(disputesApi, /const MAX_EVIDENCE_DEADLINE_HOURS = 168/, 'dispute deadline should be capped at one week');
assert.match(disputesApi, /const MAX_EVIDENCE_URL_LENGTH = 2048/, 'evidence URL length should be bounded');
assert.match(disputesApi, /const MAX_EVIDENCE_NOTE_LENGTH = 4000/, 'evidence note length should be bounded');
assert.match(disputesApi, /ALLOWED_EVIDENCE_TYPES = new Set\(\['deliverable_link', 'screenshot', 'transaction', 'conversation', 'other'\]\)/, 'evidence type should be allowlisted');

const getStart = disputesApi.indexOf("if (req.method === 'GET')");
const postStart = disputesApi.indexOf("if (req.method === 'POST')", getStart);
const getBlock = disputesApi.slice(getStart, postStart);

assert.match(getBlock, /creatorWallet/, 'GET dispute should accept creatorWallet scoping');
assert.match(getBlock, /isValidSolanaAddress\(creatorWallet\)/, 'GET dispute should validate creatorWallet when supplied');
assert.match(getBlock, /\.eq\('creator_wallet', normalizeSolanaAddress\(creatorWallet\)\)/, 'GET dispute should query by creator wallet');
assert.match(getBlock, /walletBelongsToUser\(supabase, userId, disputeCase\.client_wallet\)/, 'GET dispute should authorize legacy client-wallet cases');

const evidenceStart = disputesApi.indexOf("if (action === 'evidence')");
const recommendStart = disputesApi.indexOf("if (action === 'recommend')", evidenceStart);
const evidenceBlock = disputesApi.slice(evidenceStart, recommendStart);

assert.match(evidenceBlock, /ALLOWED_EVIDENCE_TYPES\.has\(evidenceType\)/, 'evidence action should reject unknown evidence types');
assert.match(evidenceBlock, /normalizeEvidenceUrl\(evidenceUrl\)/, 'evidence action should normalize URLs before insert');
assert.match(evidenceBlock, /Evidence link must be a valid http or https URL/, 'evidence action should reject non-http URLs');
assert.match(evidenceBlock, /Add a note or evidence link before submitting/, 'evidence action should reject empty evidence');
assert.match(evidenceBlock, /walletBelongsToUser\(supabase, userId, normalizedSubmitter\)/, 'evidence action should require submitter wallet ownership');
assert.match(evidenceBlock, /side: derivedSide/, 'evidence side should be server-derived');
assert.doesNotMatch(evidenceBlock, /side:\s*req\.body|side:\s*body|side:\s*side/, 'evidence side must not come from caller input');

assert.match(dashboard, /new URLSearchParams\(\{ invoiceId: inv\.invoiceId, creatorWallet \}\)/, 'dashboard should scope dispute metadata fetches by creator');
assert.match(evidencePage, /new URLSearchParams\(\{ invoiceId, creatorWallet: validCreator \}\)/, 'evidence page should scope dispute loads by creator');
assert.match(evidencePage, /maxLength=\{2048\}/, 'evidence page should cap URL input client-side');
assert.match(evidencePage, /maxLength=\{4000\}/, 'evidence page should cap note input client-side');

console.log('dispute API validation tests passed');
