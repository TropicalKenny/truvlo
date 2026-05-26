import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

export const DEMO_ROUTE_CHECKS = [
  {
    label: 'home page',
    path: '/',
    okStatuses: [200],
    warningStatuses: [],
    bodyIncludes: ['<div id="root"'],
  },
  {
    label: 'create invoice page',
    path: '/create',
    okStatuses: [200],
    warningStatuses: [],
    bodyIncludes: ['<div id="root"'],
  },
  {
    label: 'dashboard page',
    path: '/dashboard',
    okStatuses: [200],
    warningStatuses: [],
    bodyIncludes: ['<div id="root"'],
  },
  {
    label: 'SOL price API',
    path: '/api/sol-price',
    okStatuses: [200],
    warningStatuses: [503],
  },
  {
    label: 'agent policy API unauthenticated baseline',
    path: '/api/agent-policies',
    okStatuses: [400],
    warningStatuses: [],
  },
  {
    label: 'profile API unauthenticated baseline',
    path: '/api/profile',
    okStatuses: [401],
    warningStatuses: [],
  },
];

export function normalizeBaseUrl(rawUrl) {
  const raw = String(rawUrl ?? '').trim();
  if (!raw) throw new Error('Missing base URL. Set TRUVLO_HEALTH_BASE_URL or pass --base-url.');
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Base URL must use http or https.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

export function classifyRouteStatus(check, status) {
  if (check.okStatuses.includes(status)) {
    return { level: 'pass', reason: 'expected_status' };
  }
  if (check.warningStatuses.includes(status)) {
    return { level: 'warn', reason: 'expected_warning_status' };
  }
  if (status >= 500) {
    return { level: 'fail', reason: 'server_error_status' };
  }
  return { level: 'fail', reason: 'unexpected_status' };
}

export function classifyRpcHealth({ status, bodyText, error }) {
  if (error) {
    return { status: 'unavailable', level: 'fail', detail: 'RPC request failed' };
  }
  if (status === 429) {
    return { status: 'rate_limited', level: 'warn', detail: 'RPC returned HTTP 429' };
  }
  if (!status || status < 200 || status >= 300) {
    return { status: 'unavailable', level: 'fail', detail: `RPC returned HTTP ${status ?? 'unknown'}` };
  }

  let payload;
  try {
    payload = JSON.parse(bodyText || '{}');
  } catch {
    return { status: 'unavailable', level: 'fail', detail: 'RPC returned invalid JSON' };
  }

  const errorMessage = typeof payload?.error?.message === 'string' ? payload.error.message : '';
  if (/429|too many requests|rate limit|rate-limit/i.test(errorMessage)) {
    return { status: 'rate_limited', level: 'warn', detail: 'RPC returned a rate-limit error' };
  }
  if (payload?.result?.value?.blockhash || payload?.result?.blockhash) {
    return { status: 'healthy', level: 'pass', detail: 'RPC returned latest blockhash' };
  }
  if (payload?.error) {
    return { status: 'unavailable', level: 'fail', detail: 'RPC returned an error response' };
  }
  return { status: 'unavailable', level: 'fail', detail: 'RPC response did not include a blockhash' };
}

export function classifyEmailConfig(env = process.env) {
  const hasResendKey = Boolean(env.RESEND_API_KEY);
  const fromEmail = typeof env.FROM_EMAIL === 'string' ? env.FROM_EMAIL.trim().toLowerCase() : '';

  if (!hasResendKey && !fromEmail) {
    return { status: 'not_configured', level: 'warn', detail: 'Resend email is not configured in this environment.' };
  }
  if (hasResendKey && !fromEmail) {
    return { status: 'missing_sender', level: 'warn', detail: 'Resend is configured but FROM_EMAIL is missing.' };
  }
  if (fromEmail.endsWith('@resend.dev')) {
    return { status: 'test_sender_limited', level: 'warn', detail: 'Resend test sender is configured; delivery is limited until a sender domain is verified.' };
  }
  return { status: 'sender_domain_configured', level: 'pass', detail: 'Email sender domain appears configured.' };
}

export function shouldFailHealthCheck(results) {
  return results.some((result) => result.level === 'fail');
}

function getConfiguredBaseUrl(env) {
  return env.TRUVLO_HEALTH_BASE_URL
    || env.APP_ORIGIN
    || env.CF_PAGES_URL
    || env.CLOUDFLARE_PAGES_URL
    || env.VERCEL_PROJECT_PRODUCTION_URL
    || env.VERCEL_URL
    || 'http://127.0.0.1:4173';
}

function getConfiguredRpcUrl(env) {
  return env.SOLANA_RPC_URL || env.VITE_SOLANA_RPC_URL || DEFAULT_RPC_URL;
}

function maskUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    if (parsed.search) parsed.search = '?...';
    return parsed.toString();
  } catch {
    return '[invalid-url]';
  }
}

function parseArgs(argv, env) {
  const options = {
    baseUrl: getConfiguredBaseUrl(env),
    rpcUrl: getConfiguredRpcUrl(env),
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--base-url') {
      options.baseUrl = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--base-url=')) {
      options.baseUrl = arg.slice('--base-url='.length);
    } else if (arg === '--rpc-url') {
      options.rpcUrl = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--rpc-url=')) {
      options.rpcUrl = arg.slice('--rpc-url='.length);
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = Number(arg.slice('--timeout-ms='.length));
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 500) {
    options.timeoutMs = DEFAULT_TIMEOUT_MS;
  }
  options.baseUrl = normalizeBaseUrl(options.baseUrl);
  return options;
}

async function fetchText(url, timeoutMs, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
        ...(init.headers ?? {}),
      },
    });
    const bodyText = await response.text();
    return { response, bodyText };
  } finally {
    clearTimeout(timer);
  }
}

async function runRouteCheck(baseUrl, check, timeoutMs) {
  const url = new URL(check.path, baseUrl);
  const startedAt = Date.now();

  try {
    const { response, bodyText } = await fetchText(url, timeoutMs);
    const classified = classifyRouteStatus(check, response.status);
    const missingMarker = classified.level === 'pass'
      && check.bodyIncludes?.some((marker) => !bodyText.includes(marker));

    if (missingMarker) {
      return {
        type: 'route',
        label: check.label,
        path: check.path,
        status: response.status,
        level: 'fail',
        reason: 'missing_body_marker',
        ms: Date.now() - startedAt,
      };
    }

    return {
      type: 'route',
      label: check.label,
      path: check.path,
      status: response.status,
      level: classified.level,
      reason: classified.reason,
      ms: Date.now() - startedAt,
    };
  } catch {
    return {
      type: 'route',
      label: check.label,
      path: check.path,
      status: null,
      level: 'fail',
      reason: 'fetch_failed',
      ms: Date.now() - startedAt,
    };
  }
}

async function runRpcHealth(rpcUrl, timeoutMs) {
  const startedAt = Date.now();
  try {
    const { response, bodyText } = await fetchText(rpcUrl, timeoutMs, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'truvlo-demo-health',
        method: 'getLatestBlockhash',
        params: [{ commitment: 'confirmed' }],
      }),
    });
    const classified = classifyRpcHealth({ status: response.status, bodyText });
    return {
      type: 'rpc',
      label: 'Solana devnet RPC',
      level: classified.level,
      status: classified.status,
      detail: classified.detail,
      endpoint: maskUrl(rpcUrl),
      ms: Date.now() - startedAt,
    };
  } catch {
    const classified = classifyRpcHealth({ error: true });
    return {
      type: 'rpc',
      label: 'Solana devnet RPC',
      level: classified.level,
      status: classified.status,
      detail: classified.detail,
      endpoint: maskUrl(rpcUrl),
      ms: Date.now() - startedAt,
    };
  }
}

export async function runDemoHealthCheck(options) {
  const routeResults = [];
  for (const check of DEMO_ROUTE_CHECKS) {
    routeResults.push(await runRouteCheck(options.baseUrl, check, options.timeoutMs));
  }

  const rpcResult = await runRpcHealth(options.rpcUrl, options.timeoutMs);
  const email = classifyEmailConfig(process.env);
  const emailResult = {
    type: 'email',
    label: 'Resend email mode',
    level: email.level,
    status: email.status,
    detail: email.detail,
  };

  const results = [...routeResults, rpcResult, emailResult];
  return {
    baseUrl: options.baseUrl,
    rpcUrl: maskUrl(options.rpcUrl),
    timeoutMs: options.timeoutMs,
    results,
    failed: shouldFailHealthCheck(results),
  };
}

function formatResult(result) {
  const level = result.level.toUpperCase().padEnd(4, ' ');
  if (result.type === 'route') {
    return `[${level}] ${result.path} ${result.status ?? 'n/a'} ${result.reason} (${result.ms}ms)`;
  }
  if (result.type === 'rpc') {
    return `[${level}] RPC ${result.status}: ${result.detail} (${result.ms}ms, ${result.endpoint})`;
  }
  return `[${level}] Email ${result.status}: ${result.detail}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  const report = await runDemoHealthCheck(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Truvlo demo health: ${report.baseUrl}`);
    for (const result of report.results) {
      console.log(formatResult(result));
    }
  }

  process.exitCode = report.failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Demo health verification failed');
    process.exitCode = 1;
  });
}
