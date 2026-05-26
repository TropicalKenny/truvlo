import { randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
} from './_shared.js';
import {
  getCredentialPrefix,
  hashApiCredential,
  type Phase1Action,
  type Phase1Environment,
  type Phase1Token,
} from './_phase1-policy.js';

const VALID_ACTIONS: Phase1Action[] = [
  'create_escrow',
  'fund_escrow',
  'submit_proof',
  'request_release',
  'approve_release',
  'raise_dispute',
  'list_events',
];
const DEFAULT_AGENT_ACTIONS: Phase1Action[] = ['create_escrow', 'submit_proof', 'request_release', 'list_events'];
const DEFAULT_DEVELOPER_SCOPES: Phase1Action[] = ['create_escrow', 'submit_proof', 'request_release', 'list_events'];
const VALID_TOKENS: Phase1Token[] = ['SOL', 'USDC'];
const VALID_ENVIRONMENTS: Phase1Environment[] = ['sandbox', 'devnet', 'mainnet'];
const DEFAULT_ALLOWED_ENVIRONMENTS: Phase1Environment[] = ['devnet'];

class PublicInputError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const privyId = await requireUserId(req);
  if (!privyId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') return handleListCredentials(req, res, privyId);
    if (req.method === 'POST') return handleCreateCredential(req, res, privyId);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    if (error instanceof PublicInputError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Phase 1 credential endpoint failed:', error instanceof Error ? error.message : 'unknown error');
    return res.status(500).json({ error: 'Failed to process Phase 1 credential request' });
  }
}

async function handleListCredentials(req: VercelRequest, res: VercelResponse, privyId: string) {
  const kind = getCredentialKind(req.query.kind, { allowAll: true });
  const payload: {
    agent_identities?: unknown[];
    developer_apps?: unknown[];
  } = {};

  if (kind !== 'developer_app') {
    payload.agent_identities = await listAgentIdentities(privyId);
  }

  if (kind !== 'agent') {
    payload.developer_apps = await listDeveloperApps(privyId);
  }

  return res.status(200).json(payload);
}

async function handleCreateCredential(req: VercelRequest, res: VercelResponse, privyId: string) {
  const body = getBody(req);
  const kind = getCredentialKind(body.kind);

  if (kind === 'agent') {
    const result = await createAgentCredential(body, privyId);
    res.setHeader('Location', '/api/agent-credentials?kind=agent');
    return res.status(201).json(result);
  }

  const result = await createDeveloperCredential(body, privyId);
  res.setHeader('Location', '/api/agent-credentials?kind=developer_app');
  return res.status(201).json(result);
}

async function listAgentIdentities(privyId: string) {
  const { data: agents, error } = await supabase
    .from('agent_identities')
    .select('id, display_name, auth_method, status, wallet_authority_model, agent_wallet, max_invoice_amount, daily_spend_limit, token_scope, allowed_actions, expires_at, last_used_at, revoked_at, created_at, updated_at')
    .eq('owner_privy_id', privyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Failed to load agent identities');

  const agentRows = agents ?? [];
  const agentIds = agentRows.map((agent) => agent.id).filter((id): id is string => typeof id === 'string');
  const credentials = agentIds.length ? await listAgentCredentialPrefixes(agentIds) : [];
  const credentialsByAgent = groupBy(credentials, 'agent_id');

  return agentRows.map((agent) => ({
    ...agent,
    credentials: credentialsByAgent[String(agent.id)] ?? [],
  }));
}

async function listDeveloperApps(privyId: string) {
  const { data: apps, error } = await supabase
    .from('developer_apps')
    .select('id, developer_account_id, display_name, environment, allowed_environments, credential_status, webhook_status, usage_tier, rate_limit_per_minute, status, last_used_at, revoked_at, created_at, updated_at')
    .eq('owner_privy_id', privyId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Failed to load developer apps');

  const appRows = apps ?? [];
  const appIds = appRows.map((app) => app.id).filter((id): id is string => typeof id === 'string');
  const credentials = appIds.length ? await listDeveloperCredentialPrefixes(appIds) : [];
  const credentialsByApp = groupBy(credentials, 'developer_app_id');

  return appRows.map((app) => ({
    ...app,
    credentials: credentialsByApp[String(app.id)] ?? [],
  }));
}

async function listAgentCredentialPrefixes(agentIds: string[]) {
  const { data, error } = await supabase
    .from('agent_credentials')
    .select('id, agent_id, credential_prefix, scopes, status, expires_at, last_used_at, created_at, updated_at')
    .in('agent_id', agentIds)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Failed to load agent credential prefixes');
  return data ?? [];
}

async function listDeveloperCredentialPrefixes(appIds: string[]) {
  const { data, error } = await supabase
    .from('api_credentials')
    .select('id, developer_app_id, credential_prefix, scopes, environment, status, expires_at, last_used_at, created_at, updated_at')
    .in('developer_app_id', appIds)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Failed to load developer credential prefixes');
  return data ?? [];
}

async function createAgentCredential(body: Record<string, unknown>, privyId: string) {
  const displayName = readText(body, ['displayName', 'display_name'], 'displayName', 120);
  const allowedActions = readAllowedList(body, ['allowedActions', 'allowed_actions'], VALID_ACTIONS, DEFAULT_AGENT_ACTIONS, 'allowedActions');
  const tokenScope = readAllowedList(body, ['tokenScope', 'token_scope'], VALID_TOKENS, VALID_TOKENS, 'tokenScope');
  const expiresAt = getExpiry(body, 30, 90);
  const maxInvoiceAmount = readAmount(body, ['maxInvoiceAmount', 'max_invoice_amount'], getAgentAmountCap(), 25);
  const dailySpendLimit = readOptionalAmount(body, ['dailySpendLimit', 'daily_spend_limit'], getAgentAmountCap());
  const agentWallet = readOptionalWallet(body, ['agentWallet', 'agent_wallet']);

  const { data: agent, error: agentError } = await supabase
    .from('agent_identities')
    .insert({
      owner_privy_id: privyId,
      display_name: displayName,
      auth_method: 'api_key',
      status: 'active',
      wallet_authority_model: 'truvlo_controlled_privy_server_wallet',
      agent_wallet: agentWallet,
      max_invoice_amount: maxInvoiceAmount,
      daily_spend_limit: dailySpendLimit,
      token_scope: tokenScope,
      allowed_actions: allowedActions,
      expires_at: expiresAt,
    })
    .select('id, display_name, auth_method, status, wallet_authority_model, agent_wallet, max_invoice_amount, daily_spend_limit, token_scope, allowed_actions, expires_at, created_at, updated_at')
    .single();
  if (agentError || !agent) throw new Error('Failed to create agent identity');

  const rawCredential = generateCredential('agent');
  const credentialHash = hashApiCredential(rawCredential);
  const credentialPrefix = getCredentialPrefix(rawCredential);
  const { data: credential, error: credentialError } = await supabase
    .from('agent_credentials')
    .insert({
      agent_id: agent.id,
      credential_prefix: credentialPrefix,
      credential_hash: credentialHash,
      scopes: allowedActions,
      status: 'active',
      expires_at: expiresAt,
    })
    .select('id, credential_prefix, scopes, status, expires_at, created_at, updated_at')
    .single();

  if (credentialError || !credential) {
    await supabase.from('agent_identities').delete().eq('id', agent.id).eq('owner_privy_id', privyId);
    throw new Error('Failed to create agent credential');
  }

  return {
    kind: 'agent',
    agent_identity: agent,
    credential: {
      ...credential,
      api_key: rawCredential,
    },
  };
}

async function createDeveloperCredential(body: Record<string, unknown>, privyId: string) {
  const displayName = readText(body, ['displayName', 'display_name'], 'displayName', 160);
  const accountDisplayName = readOptionalText(body, ['accountDisplayName', 'account_display_name'], 160) ?? 'Default developer account';
  const allowedEnvironments = readAllowedEnvironments(body);
  const environment: Phase1Environment = allowedEnvironments.includes('devnet') ? 'devnet' : (allowedEnvironments[0] ?? 'devnet');
  const scopes = readAllowedList(body, ['scopes', 'allowedActions', 'allowed_actions'], VALID_ACTIONS, DEFAULT_DEVELOPER_SCOPES, 'scopes');
  const expiresAt = getExpiry(body, 30, 90);
  const rateLimitPerMinute = readRateLimit(body, 60, 600);
  const developerAccount = await getOrCreateDeveloperAccount(privyId, accountDisplayName);

  const { data: app, error: appError } = await supabase
    .from('developer_apps')
    .insert({
      developer_account_id: developerAccount.id,
      owner_privy_id: privyId,
      display_name: displayName,
      environment,
      allowed_environments: allowedEnvironments,
      credential_status: 'active',
      webhook_status: 'not_configured',
      usage_tier: 'sandbox',
      rate_limit_per_minute: rateLimitPerMinute,
      status: 'test_only',
    })
    .select('id, developer_account_id, display_name, environment, allowed_environments, credential_status, webhook_status, usage_tier, rate_limit_per_minute, status, created_at, updated_at')
    .single();
  if (appError || !app) throw new Error('Failed to create developer app');

  const rawCredential = generateCredential('developer');
  const credentialHash = hashApiCredential(rawCredential);
  const credentialPrefix = getCredentialPrefix(rawCredential);
  const { data: credential, error: credentialError } = await supabase
    .from('api_credentials')
    .insert({
      developer_app_id: app.id,
      credential_prefix: credentialPrefix,
      credential_hash: credentialHash,
      scopes,
      environment,
      status: 'active',
      expires_at: expiresAt,
    })
    .select('id, credential_prefix, scopes, environment, status, expires_at, created_at, updated_at')
    .single();

  if (credentialError || !credential) {
    await supabase.from('developer_apps').delete().eq('id', app.id).eq('owner_privy_id', privyId);
    throw new Error('Failed to create developer credential');
  }

  return {
    kind: 'developer_app',
    developer_account: developerAccount,
    developer_app: app,
    credential: {
      ...credential,
      api_key: rawCredential,
    },
  };
}

async function getOrCreateDeveloperAccount(privyId: string, displayName: string) {
  const { data: existing, error: existingError } = await supabase
    .from('developer_accounts')
    .select('id, display_name, status, created_at, updated_at')
    .eq('owner_privy_id', privyId)
    .neq('status', 'revoked')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error('Failed to load developer account');
  if (existing) return existing;

  const { data, error } = await supabase
    .from('developer_accounts')
    .insert({
      owner_privy_id: privyId,
      display_name: displayName,
      status: 'active',
    })
    .select('id, display_name, status, created_at, updated_at')
    .single();
  if (error || !data) throw new Error('Failed to create developer account');
  return data;
}

function getBody(req: VercelRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

function getCredentialKind(value: unknown, options: { allowAll?: boolean } = {}): 'agent' | 'developer_app' | 'all' {
  const raw = Array.isArray(value) ? value[0] : value;
  if ((raw == null || raw === '') && options.allowAll) return 'all';
  if (raw == null || raw === '') throw new PublicInputError('credential kind is required');
  if (raw === 'agent' || raw === 'developer_app') return raw;
  throw new PublicInputError('Invalid credential kind');
}

function readText(body: Record<string, unknown>, keys: string[], fieldName: string, maxLength: number): string {
  const value = readFirst(body, keys);
  if (typeof value !== 'string') throw new PublicInputError(`${fieldName} must be a string`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new PublicInputError(`${fieldName} must be between 1 and ${maxLength} characters`);
  }
  return trimmed;
}

function readOptionalText(body: Record<string, unknown>, keys: string[], maxLength: number): string | null {
  const value = readFirst(body, keys);
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new PublicInputError('Optional text field must be a string');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new PublicInputError(`Optional text field must be ${maxLength} characters or fewer`);
  return trimmed;
}

function readAllowedList<T extends string>(
  body: Record<string, unknown>,
  keys: string[],
  allowed: readonly T[],
  fallback: readonly T[],
  fieldName: string
): T[] {
  const value = readFirst(body, keys);
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = rawValues.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean);
  const invalid = normalized.filter((item) => !allowed.includes(item as T));
  if (invalid.length) throw new PublicInputError(`Invalid ${fieldName}`);
  const selected = normalized.filter((item): item is T => allowed.includes(item as T));
  const unique = [...new Set(selected)];
  if (unique.length) return unique;
  if (value == null || value === '') return [...fallback];
  throw new PublicInputError(`Invalid ${fieldName}`);
}

function readAllowedEnvironments(body: Record<string, unknown>): Phase1Environment[] {
  const environments = readAllowedList(
    body,
    ['allowedEnvironments', 'allowed_environments'],
    VALID_ENVIRONMENTS,
    DEFAULT_ALLOWED_ENVIRONMENTS,
    'allowedEnvironments'
  );
  if (environments.includes('mainnet') && process.env.PHASE1_ENABLE_MAINNET_AGENT_API !== 'true') {
    throw new PublicInputError('Mainnet Phase 1 credentials are not enabled', 403);
  }
  return environments;
}

function readAmount(body: Record<string, unknown>, keys: string[], cap: number, fallback: number): number {
  const value = readFirst(body, keys);
  if (value == null || value === '') return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new PublicInputError('Invalid max invoice amount');
  if (amount > cap) throw new PublicInputError('Phase 1 amount cap exceeded', 403);
  return amount;
}

function readOptionalAmount(body: Record<string, unknown>, keys: string[], cap: number): number | null {
  const value = readFirst(body, keys);
  if (value == null || value === '') return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new PublicInputError('Invalid daily spend limit');
  if (amount > cap) throw new PublicInputError('Phase 1 spend cap exceeded', 403);
  return amount;
}

function readRateLimit(body: Record<string, unknown>, fallback: number, cap: number): number {
  const value = readFirst(body, ['rateLimitPerMinute', 'rate_limit_per_minute']);
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > cap) {
    throw new PublicInputError(`rateLimitPerMinute must be an integer between 1 and ${cap}`);
  }
  return parsed;
}

function getExpiry(body: Record<string, unknown>, fallbackDays: number, maxDays: number): string {
  const value = readFirst(body, ['expiresInDays', 'expires_in_days']);
  const days = value == null || value === '' ? fallbackDays : Number(value);
  if (!Number.isInteger(days) || days <= 0 || days > maxDays) {
    throw new PublicInputError(`expiresInDays must be an integer between 1 and ${maxDays}`);
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function readOptionalWallet(body: Record<string, unknown>, keys: string[]): string | null {
  const value = readFirst(body, keys);
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !isValidSolanaAddress(value)) {
    throw new PublicInputError('Invalid agent wallet');
  }
  return normalizeSolanaAddress(value);
}

function getAgentAmountCap(): number {
  const parsed = Number(process.env.PHASE1_MAX_AGENT_INVOICE_AMOUNT ?? process.env.DEVNET_AGENT_MAX_AMOUNT_USD ?? '25');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

function generateCredential(kind: 'agent' | 'developer'): string {
  const rawCredential = `trv_${kind}_${randomBytes(32).toString('base64url')}`;
  return rawCredential;
}

function readFirst(body: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
  }
  return undefined;
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: string): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const value = row[key];
    if (typeof value === 'string') {
      acc[value] ??= [];
      acc[value].push(row);
    }
    return acc;
  }, {});
}
