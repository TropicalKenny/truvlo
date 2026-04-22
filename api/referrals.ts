import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  calculatePlatformFee,
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
} from './_shared';

type TokenType = 'USDC' | 'SOL';
type RewardSourceRole = 'creator' | 'client';

function parseAmount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseTokenType(value: unknown): TokenType | null {
  return value === 'SOL' || value === 'USDC' ? value : null;
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
    const referralCode = await ensureReferralCode(supabase, userId);
    const profile = await getProfileByPrivyId<{
      display_name: string | null;
      referral_code: string | null;
      referred_by_code: string | null;
      referral_linked_at: string | null;
      created_at: string | null;
    }>(supabase, userId, 'display_name, referral_code, referred_by_code, referral_linked_at, created_at');

    const { summary, rewards } = await loadRewardSummary(userId);
    const { data: payoutRequests } = await supabase
      .from('payout_requests')
      .select('id, token_type, amount, status, payout_cycle_date, request_deadline, requested_at, processed_at, admin_note')
      .eq('privy_id', userId)
      .order('requested_at', { ascending: false })
      .limit(12);

    return res.status(200).json({
      profile: profile ? { ...profile, referral_code: referralCode ?? profile.referral_code } : null,
      rewards,
      summary,
      payout_requests: payoutRequests ?? [],
    });
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
      invoiceAmount,
      isFinalRelease,
    } = req.body as {
      invoiceId?: string;
      creatorWallet?: string;
      clientWallet?: string;
      tokenType?: TokenType;
      invoiceAmount?: number | string;
      isFinalRelease?: boolean;
    };

    if (!invoiceId || !creatorWallet || !clientWallet || !rawTokenType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isFinalRelease) {
      return res.status(200).json({ success: true, skipped: true, reason: 'Invoice is not final yet' });
    }

    if (!isValidSolanaAddress(creatorWallet) || !isValidSolanaAddress(clientWallet)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    if (!(await walletBelongsToUser(supabase, userId, normalizeSolanaAddress(creatorWallet)))) {
      return res.status(403).json({ error: 'Creator wallet does not belong to the authenticated user' });
    }

    const tokenType = parseTokenType(rawTokenType);
    const amount = parseAmount(invoiceAmount);
    if (!tokenType || amount === null) {
      return res.status(400).json({ error: 'Invalid token type or amount' });
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
      created_at: string | null;
    }>(supabase, creatorPrivyId, 'privy_id, referral_code, referred_by_code, created_at');

    const clientProfile = clientPrivyId
      ? await getProfileByPrivyId<{
          privy_id: string;
          referral_code: string | null;
          referred_by_code: string | null;
          created_at: string | null;
        }>(supabase, clientPrivyId, 'privy_id, referral_code, referred_by_code, created_at')
      : null;

    const platformFee = calculatePlatformFee(amount);
    const rewardPool = calculateReferralPool(platformFee);

    const shares = chooseReferralShares(
      creatorProfile?.created_at ?? null,
      clientProfile?.created_at ?? null,
      Boolean(creatorProfile?.referred_by_code),
      Boolean(clientProfile?.referred_by_code)
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
