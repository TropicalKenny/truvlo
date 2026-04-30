import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';
import { WEB_ADMIN_WALLET_ADDRESS } from '../src/lib/admin.js';

async function requireAdminWallet(req: VercelRequest, walletAddress: string | undefined): Promise<string | null> {
  const userId = await requireUserId(req);
  if (!userId || !walletAddress || !isValidSolanaAddress(walletAddress)) return null;

  const normalizedWallet = normalizeSolanaAddress(walletAddress);
  if (normalizedWallet !== WEB_ADMIN_WALLET_ADDRESS) return null;
  if (!(await walletBelongsToUser(supabase, userId, normalizedWallet))) return null;

  return userId;
}

function countByStatus(rows: Array<{ status?: string | null }> = []) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

async function safeQuery<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  warnings: string[]
): Promise<T[]> {
  const result = await query;
  if (result.error) {
    warnings.push(`${label}: ${result.error.message || 'could not be loaded'}`);
    return [];
  }
  return result.data ?? [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : undefined;
  const adminPrivyId = await requireAdminWallet(req, wallet);
  if (!adminPrivyId) {
    return res.status(403).json({ error: 'Admin wallet required' });
  }

  try {
    const warnings: string[] = [];
    const [
      profiles,
      wallets,
      invoices,
      failedEmails,
      disputes,
      referralRewards,
      payoutRequests,
    ] = await Promise.all([
      safeQuery('profiles', supabase
        .from('profiles')
        .select('privy_id, display_name, notification_email, onboarding_completed_at, referral_code, referred_by_code, created_at')
        .order('created_at', { ascending: false })
        .limit(25), warnings),
      safeQuery('wallets', supabase
        .from('wallets')
        .select('privy_id, wallet_address, created_at')
        .order('created_at', { ascending: false })
        .limit(50), warnings),
      safeQuery('invoices', supabase
        .from('invoice_meta')
        .select('invoice_id, creator_wallet, client_wallet, client_email, sender_name, description, token_type, amount, email_sent, created_at, referral_reward_recorded_at, dispute_case_id')
        .order('created_at', { ascending: false })
        .limit(50), warnings),
      safeQuery('email issues', supabase
        .from('invoice_meta')
        .select('invoice_id, creator_wallet, client_email, sender_name, token_type, amount, email_sent, created_at')
        .not('client_email', 'is', null)
        .eq('email_sent', false)
        .order('created_at', { ascending: false })
        .limit(25), warnings),
      safeQuery('disputes', supabase
        .from('dispute_cases')
        .select('id, invoice_id, creator_wallet, client_wallet, status, opened_by_role, opened_at, evidence_deadline_at, decision, resolved_at')
        .order('opened_at', { ascending: false })
        .limit(50), warnings),
      safeQuery('referral rewards', supabase
        .from('referral_rewards')
        .select('id, invoice_id, source_role, referrer_privy_id, referred_privy_id, referral_code, token_type, reward_amount, status, payout_cycle_date, requested_at, paid_at, created_at')
        .order('created_at', { ascending: false })
        .limit(50), warnings),
      safeQuery('payout requests', supabase
        .from('payout_requests')
        .select('id, privy_id, token_type, payout_wallet, amount, status, payout_cycle_date, request_deadline, requested_at, processed_at, admin_note')
        .order('requested_at', { ascending: false })
        .limit(50), warnings),
    ]);

    const invoiceRows = invoices;
    const disputeRows = disputes;
    const rewardRows = referralRewards;
    const payoutRows = payoutRequests;

    return res.status(200).json({
      admin_privy_id: adminPrivyId,
      warnings,
      summary: {
        profiles: profiles.length,
        wallets: wallets.length,
        invoices: invoiceRows.length,
        disputes: disputeRows.length,
        failed_emails: failedEmails.length,
        referral_rewards: rewardRows.length,
        payout_requests: payoutRows.length,
        dispute_statuses: countByStatus(disputeRows),
        referral_statuses: countByStatus(rewardRows),
        payout_statuses: countByStatus(payoutRows),
      },
      profiles,
      wallets,
      invoices: invoiceRows,
      failed_emails: failedEmails,
      disputes: disputeRows,
      referral_rewards: rewardRows,
      payout_requests: payoutRows,
    });
  } catch (error) {
    console.error('Admin overview load error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Admin data could not be loaded' });
  }
}
