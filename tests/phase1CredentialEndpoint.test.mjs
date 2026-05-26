import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile('api/agent-credentials.ts', 'utf8');
const runtimeSource = await readFile('functions/api/[[path]].ts', 'utf8');

assert.match(source, /requireUserId\(req\)/, 'credential endpoint must require Privy authentication');
assert.match(source, /req\.method === 'GET'/, 'credential endpoint should support listing current credentials');
assert.match(source, /req\.method === 'POST'/, 'credential endpoint should support credential creation');
assert.match(source, /credential kind is required/, 'POST creation should require explicit agent or developer_app kind');

assert.match(source, /randomBytes\(32\)\.toString\('base64url'\)/, 'raw credentials should be high-entropy random values');
assert.match(source, /hashApiCredential\(rawCredential\)/, 'raw credentials must be hashed before storage');
assert.match(source, /getCredentialPrefix\(rawCredential\)/, 'only a display prefix should be stored with credentials');
assert.match(source, /credential_hash: credentialHash/, 'stored credential rows should use the hash, not the raw key');
assert.match(source, /credential_prefix: credentialPrefix/, 'stored credential rows should include a safe prefix');
assert.doesNotMatch(source, /raw_api_key|plain_api_key|private_key|secret_key/i, 'endpoint must not introduce raw secret storage fields');

for (const tableName of [
  'agent_identities',
  'agent_credentials',
  'developer_accounts',
  'developer_apps',
  'api_credentials',
]) {
  assert.match(source, new RegExp(`from\\('${tableName}'\\)`), `endpoint should use ${tableName}`);
}

assert.match(source, /owner_privy_id', privyId/, 'list queries should be scoped to the authenticated owner');
assert.match(source, /PHASE1_ENABLE_MAINNET_AGENT_API/, 'mainnet agent/developer credential access should stay feature-gated');
assert.match(source, /Invalid \$\{fieldName\}/, 'invalid scopes or environments should be rejected, not silently dropped');
assert.match(source, /api_key: rawCredential/, 'raw credential should only be returned in the creation response');
assert.match(source, /status\(201\)/, 'credential creation should return 201 Created');

assert.match(runtimeSource, /'agent-credentials': \(\) => import\('\.\.\/\.\.\/api\/agent-credentials\.js'\)/, 'Cloudflare Pages runtime must map the credential endpoint');

console.log('phase 1 credential endpoint tests passed');
