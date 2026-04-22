import { randomBytes } from 'crypto';
import type { VercelRequest } from '@vercel/node';
import { PrivyClient } from '@privy-io/server-auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PublicKey } from '@solana/web3.js';

const PRIVY_APP_ID = process.env.VITE_PRIVY_APP_ID!;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export type TokenType = 'USDC' | 'SOL';
export type ReferralRewardStatus = 'pending' | 'matured' | 'requestable' | 'requested' | 'scheduled' | 'paid' | 'rejected';
export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'closed';
export type DisputeDecision = 'creator' | 'client' | 'split';

export function getAuthToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  return header.startsWith('Bearer ') ? header.slice(7) : header;
}

export async function requireUserId(req: VercelRequest): Promise<string | null> {
  const token = getAuthToken(req);
  if (!token) return null;
  try {
    const claims = await privy.verifyAuthToken(token);
    return claims.userId;
  } catch {
    return null;
  }
}

export function isValidSolanaAddress(address: string): boolean {
  try {
    void new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

export function normalizeSolanaAddress(address: string): string {
  return new PublicKey(address).toBase58();
}

export function generateReferralCode(): string {
  return randomBytes(4).toString('hex').toUpperCase();
}

export async function getProfileByPrivyId<T extends Record<string, unknown> = Record<string, unknown>>(
  client: SupabaseClient,
  privyId: string,
  columns = '*'
): Promise<T | null> {
  const { data, error } = await client
    .from('profiles')
    .select(columns)
    .eq('privy_id', privyId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as T;
}

export async function getPrivyIdForWallet(client: SupabaseClient, walletAddress: string): Promise<string | null> {
  const { data, error } = await client
    .from('wallets')
    .select('privy_id')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (error || !data) return null;
  return data.privy_id as string;
}

export async function walletBelongsToUser(client: SupabaseClient, privyId: string, walletAddress: string): Promise<boolean> {
  const owner = await getPrivyIdForWallet(client, walletAddress);
  return owner === privyId;
}

export async function ensureReferralCode(client: SupabaseClient, privyId: string): Promise<string | null> {
  const { data, error } = await client
    .from('profiles')
    .select('referral_code')
    .eq('privy_id', privyId)
    .maybeSingle();
  if (error || !data) return null;
  if (data.referral_code) return data.referral_code as string;

  for (let i = 0; i < 5; i += 1) {
    const referralCode = generateReferralCode();
    const { error: updateError } = await client
      .from('profiles')
      .upsert({ privy_id: privyId, referral_code: referralCode }, { onConflict: 'privy_id' });
    if (!updateError) return referralCode;
  }

  return null;
}

export function calculatePlatformFee(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount < 200 ? 2 : amount * 0.01;
}

export function calculateReferralPool(platformFee: number): number {
  return platformFee * 0.1;
}

export function getNextPayoutCycle(now = new Date()): { payoutCycleDate: Date; requestDeadline: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const deadline = new Date(nextMonthStart.getTime() - 3 * 24 * 60 * 60 * 1000);

  if (now <= deadline) {
    return { payoutCycleDate: nextMonthStart, requestDeadline: deadline };
  }

  const followingMonthStart = new Date(Date.UTC(year, month + 2, 1, 0, 0, 0, 0));
  return {
    payoutCycleDate: followingMonthStart,
    requestDeadline: new Date(followingMonthStart.getTime() - 3 * 24 * 60 * 60 * 1000),
  };
}

export function chooseReferralShares(
  creatorCreatedAt: string | null | undefined,
  clientCreatedAt: string | null | undefined,
  creatorHasReferrer: boolean,
  clientHasReferrer: boolean
): Array<{ role: 'creator' | 'client'; shareBps: number }> {
  if (creatorHasReferrer && clientHasReferrer) {
    const creatorTime = creatorCreatedAt ? new Date(creatorCreatedAt).getTime() : 0;
    const clientTime = clientCreatedAt ? new Date(clientCreatedAt).getTime() : 0;
    if (creatorTime <= clientTime) {
      return [{ role: 'creator', shareBps: 3000 }, { role: 'client', shareBps: 7000 }];
    }
    return [{ role: 'creator', shareBps: 7000 }, { role: 'client', shareBps: 3000 }];
  }

  if (creatorHasReferrer) return [{ role: 'creator', shareBps: 10000 }];
  if (clientHasReferrer) return [{ role: 'client', shareBps: 10000 }];
  return [];
}
