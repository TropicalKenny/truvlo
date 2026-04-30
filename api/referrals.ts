import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
import { clusterApiUrl, Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  calculateReferralPool,
  ensureReferralCode,
  getProfileByPrivyId,
  getPrivyIdForWallet,
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
  chooseReferralShares,
} from './_shared.js';
import { calculatePlatformFeeBreakdown } from '../src/lib/platformFees.js';
import { isReferralRewardWindowActive } from '../src/lib/referralEligibility.js';
type TokenType = 'USDC' | 'SOL';
type RewardSourceRole = 'creator' | 'client';

const INVOICE_STATUS_RELEASED = 3;

function parseTokenType(value: unknown): TokenType | null {
  return value === 'SOL' || value === 'USDC' ? value : null;
}

function getSolanaRpcUrl(): string {
  return process.env.SOLANA_RPC_URL || process.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet');
}

async function createReadOnlyEscrowSdk() {
  const { EscrowPaySDK } = await import('../src/lib/escrowPaySDK.js');
  const payer = Keypair.generate();
  const mockWallet: Wallet = {
    payer,
    publicKey: payer.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
  };
  const connection = new Connection(getSolanaRpcUrl(), 'confirmed');
  return new EscrowPaySDK(new AnchorProvider(connection, mockWallet, { commitment: 'confirmed' }));
}

async function isInvoiceReleasedOnChain(invoiceId: string, creatorWallet: string): Promise<boolean> {
  const sdk = await createReadOnlyEscrowSdk();
  const result = await sdk.fetchInvoice(invoiceId, new PublicKey(creatorWallet));
  if (!result.success || !result.data) {
    throw new Error(typeof result.error === 'string' ? result.error : 'Unable to verify invoice release state');
  }
  return result.data.status === INVOICE_STATUS_RELEASED;
}

async function calculateServerPlatformFee(amount: number, tokenType: TokenType): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const solPriceUsd = tokenType === 'SOL' ? await (await createReadOnlyEscrowSdk()).getSolPriceUsd() : null;
  const breakdown = calculatePlatformFeeBreakdown({ amount, tokenType, solPriceUsd });
  if (!breakdown) throw new Error('SOL price unavailable for referral reward calculation');
  return breakdown.platformFee;
}

async function loadRewardSummary(privyId: string) {
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('status, token_type, reward_amount, source_role, invoice_id, created_at, payout_cycle_date')
    .eq('referrer_privy_id', privyId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const summary: Record<TokenType, Record<string, number>> = {
    USDC: { pending: 0, matured: 0, requestable: 0, requested: 0, scheduled: 0, paid: 0, rejected: 0 },
    SOL: { pending: 0, matured: 0, requestable: 0, requested: 0, scheduled: 0, paid: 0, rejected: 0 },
  };

  for (const row of data ?? []) {
    const tokenType = row.token_type as TokenType;
    const status = row.status as keyof typeof summary.USDC;
    const amount = Number(row.reward_amount ?? 0);
    if (summary[tokenType] && status in summary[tokenType]) {
      summary[tokenType][status] += amount;
    }
  }

  return { summary, rewards: data ?? [] };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const referralCode = await ensureReferralCode(supabase, userId);
      const profile = await getProfileByPrivyId<{
        display_name: string | null;
        referral_code: string | null;
        referred_by_code: string | null;
        referral_linked_at: string | null;
        created_at: string | null;
      }>(supabase, userId, 'display_name, referral_code, referred_by_code, referral_linked_at, created_at');

      const { summary, rewards } = await loadRewardSummary(userId);
      const { data: payoutRequests, error: payoutError } = await supabase
        .from('payout_requests')
        .select('id, token_type, amount, status, payout_cycle_date, request_deadline, requested_at, processed_at, admin_note')
        .eq('privy_id', userId)
        .order('requested_at', { ascending: false })
        .limit(12);

      if (payoutError) throw payoutError;

      return res.status(200).json({
        profile: profile ? { ...profile, referral_code: referralCode ?? profile.referral_code } : null,
        rewards,
        summary,
        payout_requests: payoutRequests ?? [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rewards data could not be loaded';
      console.error('Rewards load error:', error);
      return res.status(500).json({ error: message });
    }
  }

  if (req.method === 'PATCH') {
    const { referred_by_code } = req.body as { referred_by_code?: string | null };
    const referredByCode = typeof referred_by_code === 'string' ? referred_by_code.trim().toUpperCase() : null;

    if (!referredByCode) {
      return res.status(400).json({ error: 'referred_by_code is required' });
    }

    const referralCode = await ensureReferralCode(supabase, userId);
    if (referralCode && referralCode === referredByCode) {
      return res.status(400).json({ error: 'You cannot refer yourself' });
    }

    const { data: referrer } = await supabase
      .from('profiles')
      .select('privy_id')
      .eq('referral_code', referredByCode)
      .maybeSingle();

    if (!referrer) {
      return res.status(404).json({ error: 'Referral code not found' });
    }

    const { data: current } = await supabase
      .from('profiles')
      .select('referred_by_code')
      .eq('privy_id', userId)
      .maybeSingle();

    if (current?.referred_by_code && current.referred_by_code !== referredByCode) {
      return res.status(409).json({ error: 'Referral code already set' });
    }

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          privy_id: userId,
          referral_code: referralCode,
          referred_by_code: referredByCode,
          referral_linked_at: new Date().toISOString(),
        },
        { onConflict: 'privy_id' }
      );

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ referral_code: referralCode, referred_by_code: referredByCode });
  }

  if (req.method === 'POST') {
    const {
      invoiceId,
      creatorWallet,
      clientWallet,
      tokenType: rawTokenType,
    } = req.body as {
      invoiceId?: string;
      creatorWallet?: string;
      clientWallet?: string;
      tokenType?: TokenType;
    };

    if (!invoiceId || !creatorWallet || !clientWallet || !rawTokenType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isValidSolanaAddress(creatorWallet) || !isValidSolanaAddress(clientWallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    if (!(await walletBelongsToUser(supabase, userId, normalizeSolanaAddress(creatorWallet)))) {
      return res.status(403).json({ error: 'Creator wallet does not belong to the authenticated user' });
    }

    const tokenType = parseTokenType(rawTokenType);
    if (!tokenType) {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    // Look up the invoice from invoice_meta to get the canonical amount and
    // check whether rewards have already been recorded.
    const { data: invoiceMeta, error: metaError } = await supabase
      .from('invoice_meta')
      .select('amount, referral_reward_recorded_at, creator_wallet')
      .eq('invoice_id', invoiceId)
      .eq('creator_wallet', normalizeSolanaAddress(creatorWallet))
      .maybeSingle();

    if (metaError) return res.status(500).json({ error: metaError.message });
    if (!invoiceMeta) return res.status(404).json({ error: 'Invoice not found' });

    if (invoiceMeta.referral_reward_recorded_at) {
      return res.status(409).json({
        error: 'Referral rewards have already been recorded for this invoice',
        recorded_at: invoiceMeta.referral_reward_recorded_at,
      });
    }

    let isReleased: boolean;
    try {
      isReleased = await isInvoiceReleasedOnChain(invoiceId, normalizeSolanaAddress(creatorWallet));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to verify invoice release state';
      return res.status(503).json({ error: message });
    }

    if (!isReleased) {
      return res.status(200).json({ success: true, skipped: true, reason: 'Invoice is not final yet' });
    }

    const amount = Number(invoiceMeta.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invoice has no valid amount recorded' });
    }

    const [creatorPrivyId, clientPrivyId] = await Promise.all([
      getPrivyIdForWallet(supabase, normalizeSolanaAddress(creatorWallet)),
      getPrivyIdForWallet(supabase, normalizeSolanaAddress(clientWallet)),
    ]);

    if (!creatorPrivyId) {
      return res.status(404).json({ error: 'Creator profile not found' });
    }

    const creatorProfile = await getProfileByPrivyId<{
      privy_id: string;
      referral_code: string | null;
      referred_by_code: string | null;
      referral_linked_at: string | null;
      created_at: string | null;
    }>(supabase, creatorPrivyId, 'privy_id, referral_code, referred_by_code, referral_linked_at, created_at');

    const clientProfile = clientPrivyId
      ? await getProfileByPrivyId<{
          privy_id: string;
          referral_code: string | null;
          referred_by_code: string | null;
          referral_linked_at: string | null;
          created_at: string | null;
        }>(supabase, clientPrivyId, 'privy_id, referral_code, referred_by_code, referral_linked_at, created_at')
      : null;

    const platformFee = await calculateServerPlatformFee(amount, tokenType);
    const rewardPool = calculateReferralPool(platformFee);

    const shares = chooseReferralShares(
      creatorProfile?.created_at ?? null,
      clientProfile?.created_at ?? null,
      Boolean(creatorProfile?.referred_by_code) && isReferralRewardWindowActive(creatorProfile?.referral_linked_at),
      Boolean(clientProfile?.referred_by_code) && isReferralRewardWindowActive(clientProfile?.referral_linked_at)
    );

    if (shares.length === 0 || rewardPool <= 0) {
      await supabase
        .from('invoice_meta')
        .update({
          creator_privy_id: creatorPrivyId,
          client_privy_id: clientPrivyId ?? null,
          client_wallet: normalizeSolanaAddress(clientWallet),
          referral_reward_recorded_at: new Date().toISOString(),
        })
        .eq('invoice_id', invoiceId)
        .eq('creator_wallet', normalizeSolanaAddress(creatorWallet));

      return res.status(200).json({ success: true, created: 0, skipped: true });
    }

    const records = await Promise.all(
      shares.map(async share => {
        const sourcePrivyId = share.role === 'creator' ? creatorPrivyId : clientPrivyId;
        if (!sourcePrivyId) return null;

        const sourceProfile = share.role === 'creator' ? creatorProfile : clientProfile;
        const referralCode = sourceProfile?.referred_by_code ?? null;
        if (!referralCode) return null;

        const { data: referrerProfile } = await supabase
          .from('profiles')
          .select('privy_id')
          .eq('referral_code', referralCode)
          .maybeSingle();
        if (!referrerProfile) return null;

        const rewardAmount = Number((rewardPool * (share.shareBps / 10000)).toFixed(9));
        const { error } = await supabase.from('referral_rewards').upsert(
          {
            invoice_id: invoiceId,
            source_role: share.role as RewardSourceRole,
            referrer_privy_id: referrerProfile.privy_id,
            referred_privy_id: sourcePrivyId,
            referrer_wallet: null,
            referral_code: referralCode,
            token_type: tokenType,
            invoice_amount: amount,
            platform_fee: platformFee,
            reward_pool: rewardPool,
            reward_amount: rewardAmount,
            reward_share_bps: share.shareBps,
            status: 'matured',
            requestable_at: new Date().toISOString(),
          },
          { onConflict: 'invoice_id,source_role' }
        );

        if (error) throw error;
        return { role: share.role, reward_amount: rewardAmount, share_bps: share.shareBps };
      })
    );

    const created = records.filter(Boolean);

    await supabase
      .from('invoice_meta')
      .update({
        creator_privy_id: creatorPrivyId,
        client_privy_id: clientPrivyId ?? null,
        client_wallet: normalizeSolanaAddress(clientWallet),
        referral_reward_recorded_at: new Date().toISOString(),
      })
      .eq('invoice_id', invoiceId)
      .eq('creator_wallet', normalizeSolanaAddress(creatorWallet));

    return res.status(200).json({
      success: true,
      created: created.length,
      records: created,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
