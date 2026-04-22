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
      rewards: { USDC: usdcRewards, SOL: solRewards },
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

    // FIX: Guard against concurrent double-submission before touching any rows.
    // Check for an existing pending request for this user + tokenType.
    // Recommended long-term: add a partial unique index in Postgres:
    //   CREATE UNIQUE INDEX payout_requests_one_pending_per_user
    //   ON payout_requests (privy_id, token_type)
    //   WHERE status = 'pending';
    // That index makes this check race-safe. Until then, this guard catches the
    // common case and the unique index catches the race.
    const { data: existingPending } = await supabase
      .from('payout_requests')
      .select('id')
      .eq('privy_id', userId)
      .eq('token_type', tokenType)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingPending) {
      return res.status(409).json({
        error: 'You already have a pending payout request for this token. Wait for it to be processed before submitting another.',
      });
    }

    const rewards = await loadAvailableRewards(userId, tokenType);
    const amount = rewards.reduce((sum, row) => sum + toNumber(row.reward_amount), 0);
    if (amount < 10) {
      return res.status(400).json({ error: 'You need at least $10 in available rewards before requesting payout' });
    }

    const { payoutCycleDate, requestDeadline } = getNextPayoutCycle();

    // FIX: Insert the payout request row.
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
      // Catch the race that the unique index would prevent.
      if (requestError.code === '23505') {
        return res.status(409).json({ error: 'A concurrent payout request was already submitted' });
      }
      return res.status(500).json({ error: requestError.message });
    }

    // FIX: Only update rewards whose payout_request_id is still null.
    // This prevents a second concurrent request from claiming the same rewards
    // even if both passed the existence check above (belt-and-suspenders).
    const rewardIds = rewards.map(row => row.id);
    const { error: updateError, count } = await supabase
      .from('referral_rewards')
      .update({
        status: 'requested',
        payout_request_id: request.id,
        payout_cycle_date: payoutCycleDate.toISOString().slice(0, 10),
        requested_at: new Date().toISOString(),
      })
      .in('id', rewardIds)
      .is('payout_request_id', null)   // guard: skip any already claimed by a race
      .eq('referrer_privy_id', userId); // belt-and-suspenders: never touch other users' rows

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.status(200).json({
      success: true,
      payout_request: request,
      reward_count: count ?? rewardIds.length,
      amount,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
