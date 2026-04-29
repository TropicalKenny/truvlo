import type { VercelRequest, VercelResponse } from '@vercel/node';

const SOL_USD_FEED_ID = '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d';
const HERMES_URL = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}`;
const CACHE_TTL_MS = 30_000;
const STALE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 2_500;

let cachedPrice: { price: number; fetchedAt: number } | null = null;

function parsePythPrice(data: unknown): number | null {
  const parsed = data as { parsed?: Array<{ price?: { price?: string; expo?: number } }> };
  const price = parsed?.parsed?.[0]?.price;
  if (!price || typeof price.price !== 'string' || typeof price.expo !== 'number') return null;

  const computed = Number(price.price) * Math.pow(10, price.expo);
  if (!Number.isFinite(computed) || computed < 0.1 || computed > 100_000) return null;
  return computed;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const now = Date.now();
  if (cachedPrice && now - cachedPrice.fetchedAt < CACHE_TTL_MS) {
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ price: cachedPrice.price, cached: true });
  }

  try {
    const response = await fetch(HERMES_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });

    if (!response.ok) throw new Error(`Hermes HTTP ${response.status}`);

    const price = parsePythPrice(await response.json());
    if (!price) throw new Error('Invalid Hermes price response');

    cachedPrice = { price, fetchedAt: now };
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    return res.status(200).json({ price, cached: false });
  } catch (error) {
    if (cachedPrice && now - cachedPrice.fetchedAt < STALE_TTL_MS) {
      console.warn('Serving stale SOL price:', error);
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=30');
      return res.status(200).json({ price: cachedPrice.price, cached: true, stale: true });
    }

    console.error('SOL price load failed:', error);
    return res.status(503).json({ error: 'SOL price unavailable' });
  }
}
