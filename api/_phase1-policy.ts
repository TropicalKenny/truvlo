import { createHash, timingSafeEqual } from 'node:crypto';

export type Phase1Environment = 'sandbox' | 'devnet' | 'mainnet';
export type Phase1Action =
  | 'create_escrow'
  | 'fund_escrow'
  | 'submit_proof'
  | 'request_release'
  | 'approve_release'
  | 'raise_dispute'
  | 'list_events';
export type Phase1Token = 'SOL' | 'USDC';

export const PHASE1_POLICY_ERROR_CODES = {
  MISSING_CREDENTIAL: 'missing_credential',
  INVALID_CREDENTIAL: 'invalid_credential',
  AGENT_NOT_FOUND: 'agent_not_found',
  AGENT_PAUSED: 'agent_paused',
  AGENT_REVOKED: 'agent_revoked',
  AGENT_EXPIRED: 'agent_expired',
  DEVELOPER_APP_NOT_FOUND: 'developer_app_not_found',
  DEVELOPER_APP_PAUSED: 'developer_app_paused',
  DEVELOPER_APP_REVOKED: 'developer_app_revoked',
  DEVELOPER_APP_PRODUCTION_GATED: 'developer_app_production_gated',
  ENVIRONMENT_NOT_ALLOWED: 'environment_not_allowed',
  ACTION_NOT_ALLOWED: 'action_not_allowed',
  TOKEN_NOT_ALLOWED: 'token_not_allowed',
  AMOUNT_LIMIT_EXCEEDED: 'amount_limit_exceeded',
  POLICY_EXPIRED: 'policy_expired',
} as const;

export type Phase1PolicyErrorCode = typeof PHASE1_POLICY_ERROR_CODES[keyof typeof PHASE1_POLICY_ERROR_CODES];

export type Phase1Decision =
  | { allowed: true }
  | { allowed: false; code: Phase1PolicyErrorCode };

export type AgentIdentityPolicy = {
  id?: string;
  status?: 'active' | 'paused' | 'revoked' | 'expired' | null;
  expires_at?: string | null;
  allowed_actions?: string[] | null;
  token_scope?: string[] | null;
  max_invoice_amount?: number | string | null;
};

export type DeveloperAppPolicy = {
  id?: string;
  status?: 'active' | 'test_only' | 'paused' | 'revoked' | 'production_gated' | null;
  allowed_environments?: string[] | null;
};

export type CapabilityRequest = {
  action: Phase1Action;
  tokenType?: Phase1Token | null;
  amount?: number | string | null;
  environment: Phase1Environment;
  now?: Date;
};

export function getCredentialPrefix(rawCredential: string): string {
  return rawCredential.trim().slice(0, 16);
}

export function hashApiCredential(rawCredential: string): string {
  return createHash('sha256').update(rawCredential.trim(), 'utf8').digest('hex');
}

export function credentialHashMatches(rawCredential: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiCredential(rawCredential), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function extractApiCredential(headers: Record<string, string | string[] | undefined>): string | null {
  const directHeader = headers['x-truvlo-api-key'] ?? headers['X-Truvlo-Api-Key'];
  const directValue = Array.isArray(directHeader) ? directHeader[0] : directHeader;
  if (typeof directValue === 'string' && directValue.trim()) return directValue.trim();

  const authorization = headers.authorization ?? headers.Authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  if (typeof value !== 'string') return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function evaluateAgentIdentity(agent: AgentIdentityPolicy | null | undefined, request: CapabilityRequest): Phase1Decision {
  if (!agent) return deny(PHASE1_POLICY_ERROR_CODES.AGENT_NOT_FOUND);
  if (agent.status === 'paused') return deny(PHASE1_POLICY_ERROR_CODES.AGENT_PAUSED);
  if (agent.status === 'revoked') return deny(PHASE1_POLICY_ERROR_CODES.AGENT_REVOKED);
  if (agent.status === 'expired') return deny(PHASE1_POLICY_ERROR_CODES.AGENT_EXPIRED);
  if (isExpired(agent.expires_at, request.now)) return deny(PHASE1_POLICY_ERROR_CODES.AGENT_EXPIRED);
  return evaluateCapabilityPolicy(agent, request);
}

export function evaluateDeveloperApp(app: DeveloperAppPolicy | null | undefined, request: CapabilityRequest): Phase1Decision {
  if (!app) return deny(PHASE1_POLICY_ERROR_CODES.DEVELOPER_APP_NOT_FOUND);
  if (app.status === 'paused') return deny(PHASE1_POLICY_ERROR_CODES.DEVELOPER_APP_PAUSED);
  if (app.status === 'revoked') return deny(PHASE1_POLICY_ERROR_CODES.DEVELOPER_APP_REVOKED);
  if (app.status === 'production_gated') return deny(PHASE1_POLICY_ERROR_CODES.DEVELOPER_APP_PRODUCTION_GATED);
  if (app.status === 'test_only' && request.environment === 'mainnet') {
    return deny(PHASE1_POLICY_ERROR_CODES.DEVELOPER_APP_PRODUCTION_GATED);
  }
  if (app.allowed_environments?.length && !app.allowed_environments.includes(request.environment)) {
    return deny(PHASE1_POLICY_ERROR_CODES.ENVIRONMENT_NOT_ALLOWED);
  }
  return allow();
}

export function evaluateCapabilityPolicy(policy: AgentIdentityPolicy, request: CapabilityRequest): Phase1Decision {
  if (isExpired(policy.expires_at, request.now)) return deny(PHASE1_POLICY_ERROR_CODES.POLICY_EXPIRED);
  if (policy.allowed_actions?.length && !policy.allowed_actions.includes(request.action)) {
    return deny(PHASE1_POLICY_ERROR_CODES.ACTION_NOT_ALLOWED);
  }
  if (request.tokenType && policy.token_scope?.length && !policy.token_scope.includes(request.tokenType)) {
    return deny(PHASE1_POLICY_ERROR_CODES.TOKEN_NOT_ALLOWED);
  }
  const maxAmount = toFiniteNumber(policy.max_invoice_amount);
  const requestedAmount = toFiniteNumber(request.amount);
  if (maxAmount != null && requestedAmount != null && requestedAmount > maxAmount) {
    return deny(PHASE1_POLICY_ERROR_CODES.AMOUNT_LIMIT_EXCEEDED);
  }
  return allow();
}

export function evaluatePhase1Request(input: {
  agent?: AgentIdentityPolicy | null;
  developerApp?: DeveloperAppPolicy | null;
  request: CapabilityRequest;
}): Phase1Decision {
  const agentDecision = evaluateAgentIdentity(input.agent, input.request);
  if (!agentDecision.allowed) return agentDecision;

  if (input.developerApp) {
    const developerDecision = evaluateDeveloperApp(input.developerApp, input.request);
    if (!developerDecision.allowed) return developerDecision;
  }

  return allow();
}

function allow(): Phase1Decision {
  return { allowed: true };
}

function deny(code: Phase1PolicyErrorCode): Phase1Decision {
  return { allowed: false, code };
}

function isExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const time = new Date(expiresAt).getTime();
  return Number.isFinite(time) && time <= now.getTime();
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
