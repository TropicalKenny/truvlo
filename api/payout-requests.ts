import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getNextPayoutCycle,
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared';

type TokenType = 'USDC' | 'SOL';

function parseTokenType(value: unknown): TokenType | null {
  return value === 'SOL' || value === 'USDC' ? value : null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function loadAvailableRewards(privyId: string, tokenType: TokenType) {
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('id, reward_amount, status')
    .eq('referrer_privy_id', privyId)
    .eq('token_type', tokenType)
    .in('status', ['matured', 'requestable'])
    .is('payout_request_id', null);

  if (error) throw error;
  return data ?? [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const [usdcRewards, solRewards, payoutRequests] = await Promise.all([
      loadAvailableRewards(userId, 'USDC'),
      loadAvailableRewards(userId, 'SOL'),
      supabase
        .from('payout_requests')
        .select('id, token_type, amount, status, payout_cycle_date, request_deadline, requested_at, processed_at, admin_note, payout_wallet')
        .eq('privy_id', userId)
        .order('requested_at', { ascending: false })
        .limit(20),
    ]);

    const totalByToken = {
      USDC: usdcRewards.reduce((sum, row) => sum + toNumber(row.reward_amount), 0),
      SOL: solRewards.reduce((sum, row) => sum + toNumber(row.reward_amount), 0),
    };

    return res.status(200).json({
      balances: totalByToken,
      rewards: {
        USDC: usdcRewards,
        SOL: solRewards,
      },
      payout_requests: payoutRequests.data ?? [],
    });
  }

  if (req.method === 'POST') {
    const { tokenType: rawTokenType, payoutWallet } = req.body as {
      tokenType?: TokenType;
      payoutWallet?: string;
    };

    const tokenType = parseTokenType(rawTokenType);
    if (!tokenType) {
      return res.status(400).json({ error: 'tokenType must be USDC or SOL' });
    }

    if (!payoutWallet || !isValidSolanaAddress(payoutWallet)) {
      return res.status(400).json({ error: 'Valid payoutWallet is required' });
    }

    if (!(await walletBelongsToUser(supabase, userId, normalizeSolanaAddress(payoutWallet)))) {
      return res.status(403).json({ error: 'Payout wallet does not belong to the authenticated user' });
    }

    const rewards = await loadAvailableRewards(userId, tokenType);
    const amount = rewards.reduce((sum, row) => sum + toNumber(row.reward_amount), 0);
    if (amount < 10) {
      return res.status(400).json({ error: 'You need at least $10 in available rewards before requesting payout' });
    }

    const { payoutCycleDate, requestDeadline } = getNextPayoutCycle();
    const { data: request, error: requestError } = await supabase
      .from('payout_requests')
      .insert({
        privy_id: userId,
        token_type: tokenType,
        payout_wallet: normalizeSolanaAddress(payoutWallet),
        amount,
        status: 'pending',
        payout_cycle_date: payoutCycleDate.toISOString().slice(0, 10),
        request_deadline: requestDeadline.toISOString(),
      })
      .select('*')
      .single();

    if (requestError) {
      return res.status(500).json({ error: requestError.message });
    }

    const rewardIds = rewards.map(row => row.id);
    const { error: updateError } = await supabase
      .from('referral_rewards')
      .update({
        status: 'requested',
        payout_request_id: request.id,
        payout_cycle_date: payoutCycleDate.toISOString().slice(0, 10),
        requested_at: new Date().toISOString(),
      })
      .in('id', rewardIds);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({ success: true, payout_request: request, reward_count: rewardIds.length, amount });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
