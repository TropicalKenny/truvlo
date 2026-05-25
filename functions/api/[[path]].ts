type QueryValue = string | string[];

type VercelLikeRequest = {
  method: string;
  headers: Record<string, string>;
  query: Record<string, QueryValue>;
  body: unknown;
  url: string;
};

type VercelLikeResponse = {
  statusCode: number;
  status: (code: number) => VercelLikeResponse;
  setHeader: (name: string, value: number | string | readonly string[]) => VercelLikeResponse;
  getHeader: (name: string) => string | null;
  json: (payload: unknown) => Response;
  send: (payload?: unknown) => Response;
  end: (payload?: unknown) => Response;
};

type HandlerModule = {
  default: (req: VercelLikeRequest, res: VercelLikeResponse) => unknown | Promise<unknown>;
};

type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
  params: {
    path?: string | string[];
  };
};

const AGENT_REWRITES: Record<string, string> = {
  'agent-verifications': 'agent-verifications',
  'agent-policies': 'agent-policies',
  'devnet-agent-actions': 'devnet-agent-actions',
  'x402-escrow-intent': 'x402-escrow-intent',
  'telegram-link': 'telegram-link',
  'telegram-webhook': 'telegram-webhook',
};

const ROUTES: Record<string, () => Promise<HandlerModule>> = {
  'admin-overview': () => import('../../api/admin-overview.js'),
  'combined-profile': () => import('../../api/combined-profile.js'),
  'create-invoice-meta': () => import('../../api/create-invoice-meta.js'),
  'disputes': () => import('../../api/disputes.js'),
  'notify-client': () => import('../../api/notify-client.js'),
  'notify-creator': () => import('../../api/notify-creator.js'),
  'payout-requests': () => import('../../api/payout-requests.js'),
  'profile': () => import('../../api/profile.js'),
  'referrals': () => import('../../api/referrals.js'),
  'register-wallet': () => import('../../api/register-wallet.js'),
  'send-invoice': () => import('../../api/send-invoice.js'),
  'sol-price': () => import('../../api/sol-price.js'),
};

class PagesResponse implements VercelLikeResponse {
  statusCode = 200;
  private headers = new Headers();
  private body: BodyInit | null = null;

  status(code: number): VercelLikeResponse {
    this.statusCode = code;
    return this;
  }

  setHeader(name: string, value: number | string | readonly string[]): VercelLikeResponse {
    const headerValue = Array.isArray(value) ? value.join(', ') : String(value);
    this.headers.set(name, headerValue);
    return this;
  }

  getHeader(name: string): string | null {
    return this.headers.get(name);
  }

  json(payload: unknown): Response {
    this.headers.set('content-type', 'application/json; charset=utf-8');
    this.body = JSON.stringify(payload);
    return this.toResponse();
  }

  send(payload?: unknown): Response {
    if (payload === undefined || payload === null) {
      this.body = null;
    } else if (typeof payload === 'string' || payload instanceof Blob || payload instanceof ArrayBuffer) {
      this.body = payload;
    } else {
      this.headers.set('content-type', 'application/json; charset=utf-8');
      this.body = JSON.stringify(payload);
    }

    return this.toResponse();
  }

  end(payload?: unknown): Response {
    return this.send(payload);
  }

  toResponse(): Response {
    return new Response(this.body, {
      status: this.statusCode,
      headers: this.headers,
    });
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  applyEnvironment(context.env);

  const routePath = getRoutePath(context.params.path);
  const route = AGENT_REWRITES[routePath] ? 'create-invoice-meta' : routePath;
  const loader = ROUTES[route];

  if (!loader) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const requestUrl = new URL(context.request.url);
  if (AGENT_REWRITES[routePath]) {
    requestUrl.searchParams.set('agentEndpoint', AGENT_REWRITES[routePath]);
  }

  const req: VercelLikeRequest = {
    method: context.request.method,
    headers: getHeaders(context.request),
    query: getQuery(requestUrl),
    body: await getBody(context.request),
    url: requestUrl.pathname + requestUrl.search,
  };

  const res = new PagesResponse();
  const mod = await loader();
  const result = await mod.default(req, res);

  if (result instanceof Response) {
    return result;
  }

  return res.toResponse();
}

function applyEnvironment(env: Record<string, unknown>): void {
  const globalWithProcess = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string>;
    };
  };

  globalWithProcess.process ??= {};
  globalWithProcess.process.env ??= {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      globalWithProcess.process.env[key] = value;
    }
  }
}

function getRoutePath(pathParam: string | string[] | undefined): string {
  const rawPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam || '';
  return rawPath.replace(/^\/+|\/+$/g, '');
}

function getHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  headers.host ??= new URL(request.url).host;
  return headers;
}

function getQuery(url: URL): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {};

  for (const [key, value] of url.searchParams.entries()) {
    const existing = query[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (typeof existing === 'string') {
      query[key] = [existing, value];
    } else {
      query[key] = value;
    }
  }

  return query;
}

async function getBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const rawBody = await request.text();
  if (!rawBody) {
    return undefined;
  }

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawBody);
    } catch {
      return undefined;
    }
  }

  return rawBody;
}

