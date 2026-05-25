type HeaderValue = string | string[] | undefined;

function firstHeader(value: HeaderValue): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function cleanOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const url = new URL(origin.startsWith('http') ? origin : `https://${origin}`);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolveAppOrigin({
  envOrigin,
  deploymentUrl,
  vercelUrl,
  headers,
}: {
  envOrigin?: string;
  deploymentUrl?: string;
  vercelUrl?: string;
  headers: Record<string, HeaderValue>;
}): string | null {
  const configured = cleanOrigin(envOrigin);
  if (configured) return configured;

  const deployment = cleanOrigin(deploymentUrl || vercelUrl);
  if (deployment) return deployment;

  const proto = firstHeader(headers['x-forwarded-proto']) || 'https';
  const host = firstHeader(headers['x-forwarded-host']) || firstHeader(headers.host);
  const fromHost = cleanOrigin(host ? `${proto}://${host}` : undefined);
  if (fromHost) return fromHost;

  return cleanOrigin(firstHeader(headers.origin));
}
