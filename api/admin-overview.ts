import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
import { clusterApiUrl, Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { requireAdmin, type AdminContext, type AdminRole, type AdminSection, logAdminAction, maskEmail, maskIdentifier, shortWallet } from './_admin.js';
import { supabase } from './_shared.js';

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message?: string } | null }>;
type Row = Record<string, unknown>;
const INVOICE_STATUS_DISPUTED = 4;

function countByStatus(rows: Array<{ status?: string | null }> = []) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
}

async function safeQuery<T>(label: string, query: QueryResult<T>, warnings: string[]): Promise<T[]> {
  const result = await query;
  if (result.error) {
    warnings.push(`${label}: ${result.error.message || 'could not be loaded'}`);
    return [];
  }
  return result.data ?? [];
}

function canSee(admin: AdminContext, section: AdminSection): boolean {
  return admin.allowedSections.includes(section);
}

function redactRows(section: AdminSection, rows: Row[], role: AdminRole): Row[] {
  if (role === 'owner') return rows;

  return rows.map(row => {
    const safe: Row = {};

    if (section === 'invoices') {
      safe.invoice_id = row.invoice_id;
      safe.sender_name = row.sender_name;
      safe.creator_wallet = shortWallet(row.creator_wallet);
      safe.client_wallet = shortWallet(row.client_wallet);
      safe.amount = row.amount;
      safe.token_type = row.token_type;
      safe.created_at = row.created_at;
      safe.dispute_case_id = row.dispute_case_id ? maskIdentifier(row.dispute_case_id) : null;
      return safe;
    }

    if (section === 'disputes') {
      safe.id = role === 'owner' ? row.id : maskIdentifier(row.id);
      safe.invoice_id = row.invoice_id;
      safe.status = row.status;
      safe.opened_by_role = row.opened_by_role;
      safe.creator_wallet = role === 'owner' ? row.creator_wallet : shortWallet(row.creator_wallet);
      safe.client_wallet = role === 'owner' ? row.client_wallet : shortWallet(row.client_wallet);
      safe.opened_at = row.opened_at;
      safe.evidence_deadline_at = row.evidence_deadline_at;
      safe.recommendation_decision = row.recommendation_decision;
      safe.recommendation_creator_bps = row.recommendation_creator_bps;
      safe.recommendation_client_bps = row.recommendation_client_bps;
      safe.recommendation_confidence = row.recommendation_confidence;
      safe.recommendation_note = row.recommendation_note;
      safe.recommendation_risks = row.recommendation_risks;
      safe.recommendation_generated_at = row.recommendation_generated_at;
      safe.decision = row.decision;
      safe.resolved_at = row.resolved_at;
      safe.resolution_creator_bps = row.resolution_creator_bps;
      safe.resolution_client_bps = row.resolution_client_bps;
      safe.verdict_note = row.verdict_note;
      safe.verdict_hash = row.verdict_hash;
      safe.verdict_hash_signature = row.verdict_hash_signature;
      safe.resolution_signature = row.resolution_signature;
      safe.onchain_resolved_at = row.onchain_resolved_at;
      safe.token_type = row.token_type;
      safe.amount = row.amount;
      return safe;
    }

    if (section === 'referral_rewards') {
      safe.invoice_id = row.invoice_id;
      safe.source_role = row.source_role;
      safe.referrer_privy_id = maskIdentifier(row.referrer_privy_id);
      safe.referred_privy_id = maskIdentifier(row.referred_privy_id);
      safe.token_type = row.token_type;
      safe.reward_amount = row.reward_amount;
      safe.status = row.status;
      safe.payout_cycle_date = row.payout_cycle_date;
      safe.requested_at = row.requested_at;
      safe.paid_at = row.paid_at;
      safe.created_at = row.created_at;
      return safe;
    }

    if (section === 'payout_requests') {
      safe.privy_id = maskIdentifier(row.privy_id);
      safe.token_type = row.token_type;
      safe.payout_wallet = shortWallet(row.payout_wallet);
      safe.amount = row.amount;
      safe.status = row.status;
      safe.payout_cycle_date = row.payout_cycle_date;
      safe.request_deadline = row.request_deadline;
      safe.requested_at = row.requested_at;
      safe.processed_at = row.processed_at;
      return safe;
    }

    if (section === 'failed_emails') {
      safe.invoice_id = row.invoice_id;
      safe.sender_name = row.sender_name;
      safe.creator_wallet = shortWallet(row.creator_wallet);
      safe.client_email = maskEmail(row.client_email);
      safe.amount = row.amount;
      safe.token_type = row.token_type;
      safe.created_at = row.created_at;
      return safe;
    }

    return safe;
  });
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

async function reconcileDisputes(admin: AdminContext) {
  const { data: invoiceMetaRows, error } = await supabase
    .from('invoice_meta')
    .select('invoice_id, creator_wallet, client_wallet, creator_privy_id, client_privy_id, dispute_case_id')
    .is('dispute_case_id', null)
    .order('created_at', { ascending: false })
    .limit(150);

  if (error) throw error;

  const sdk = await createReadOnlyEscrowSdk();
  let checked = 0;
  let created = 0;
  let skipped = 0;
  const failures: Array<{ invoice_id: string; error: string }> = [];

  for (const row of invoiceMetaRows ?? []) {
    checked += 1;
    try {
      const result = await sdk.fetchInvoice(row.invoice_id, new PublicKey(row.creator_wallet));
      if (!result.success || !result.data || result.data.status !== INVOICE_STATUS_DISPUTED) {
        skipped += 1;
        continue;
      }

      const evidenceDeadlineAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const { data: disputeCase, error: insertError } = await supabase
        .from('dispute_cases')
        .insert({
          invoice_id: row.invoice_id,
          creator_wallet: row.creator_wallet,
          client_wallet: row.client_wallet ?? result.data.client?.toBase58() ?? null,
          creator_privy_id: row.creator_privy_id ?? null,
          client_privy_id: row.client_privy_id ?? null,
          opened_by_privy_id: admin.privyId,
          opened_by_role: 'admin',
          status: 'open',
          evidence_deadline_at: evidenceDeadlineAt,
        })
        .select('id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          skipped += 1;
          continue;
        }
        throw insertError;
      }

      await supabase
        .from('invoice_meta')
        .update({ dispute_case_id: disputeCase.id })
        .eq('invoice_id', row.invoice_id)
        .eq('creator_wallet', row.creator_wallet);

      await logAdminAction(admin, 'dispute.backfill', 'invoice', row.invoice_id, {
        dispute_case_id: disputeCase.id,
      }).catch(logError => console.error('Admin audit log error:', logError));

      created += 1;
    } catch (failure) {
      failures.push({
        invoice_id: row.invoice_id,
        error: failure instanceof Error ? failure.message : 'Unknown reconciliation error',
      });
    }
  }

  return { checked, created, skipped, failures };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = (req.body ?? {}) as { action?: string; adminWallet?: string };
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : body.adminWallet;
  const requiredPermission = req.method === 'POST' && body.action === 'reconcile_disputes'
    ? 'dispute_backfill'
    : 'admin_overview';
  const admin = await requireAdmin(req, wallet, requiredPermission);
  if (!admin) {
    return res.status(403).json({ error: 'Admin role required' });
  }

  try {
    if (req.method === 'POST') {
      if (body.action !== 'reconcile_disputes') {
        return res.status(400).json({ error: 'Unknown admin action' });
      }
      const result = await reconcileDisputes(admin);
      return res.status(200).json({ success: true, ...result });
    }

    const warnings: string[] = [];

    const profiles = canSee(admin, 'profiles')
      ? await safeQuery('profiles', supabase
          .from('profiles')
          .select('privy_id, display_name, notification_email, onboarding_completed_at, referral_code, referred_by_code, created_at')
          .order('created_at', { ascending: false })
          .limit(25), warnings)
      : [];

    const wallets = canSee(admin, 'wallets')
      ? await safeQuery('wallets', supabase
          .from('wallets')
          .select('privy_id, wallet_address, created_at')
          .order('created_at', { ascending: false })
          .limit(50), warnings)
      : [];

    const invoices = canSee(admin, 'invoices')
      ? await safeQuery<Row>('invoices', supabase
          .from('invoice_meta')
          .select('invoice_id, creator_wallet, client_wallet, client_email, sender_name, description, token_type, amount, email_sent, created_at, referral_reward_recorded_at, dispute_case_id')
          .order('created_at', { ascending: false })
          .limit(50), warnings)
      : [];

    const failedEmails = canSee(admin, 'failed_emails')
      ? await safeQuery<Row>('email issues', supabase
          .from('invoice_meta')
          .select('invoice_id, creator_wallet, client_email, sender_name, token_type, amount, email_sent, created_at')
          .not('client_email', 'is', null)
          .eq('email_sent', false)
          .order('created_at', { ascending: false })
          .limit(25), warnings)
      : [];

    let disputes = canSee(admin, 'disputes')
      ? await safeQuery<Row>('disputes', supabase
          .from('dispute_cases')
          .select('id, invoice_id, creator_wallet, client_wallet, status, opened_by_role, opened_at, evidence_deadline_at, recommendation_decision, recommendation_creator_bps, recommendation_client_bps, recommendation_confidence, recommendation_note, recommendation_risks, recommendation_generated_at, decision, resolved_at, resolution_creator_bps, resolution_client_bps, verdict_note, verdict_hash, verdict_hash_signature, resolution_signature, onchain_resolved_at')
          .order('opened_at', { ascending: false })
          .limit(50), warnings)
      : [];

    if (disputes.length > 0) {
      const invoiceIds = Array.from(new Set(disputes.map(row => String(row.invoice_id)).filter(Boolean)));
      const disputeInvoiceMeta = await safeQuery<Row>('dispute invoice metadata', supabase
        .from('invoice_meta')
        .select('invoice_id, creator_wallet, token_type, amount')
        .in('invoice_id', invoiceIds), warnings);
      const metaByKey = new Map(disputeInvoiceMeta.map(row => [`${row.invoice_id}:${row.creator_wallet}`, row]));
      disputes = disputes.map(row => ({
        ...row,
        token_type: metaByKey.get(`${row.invoice_id}:${row.creator_wallet}`)?.token_type ?? null,
        amount: metaByKey.get(`${row.invoice_id}:${row.creator_wallet}`)?.amount ?? null,
      }));
    }

    const referralRewards = canSee(admin, 'referral_rewards')
      ? await safeQuery<Row>('referral rewards', supabase
          .from('referral_rewards')
          .select('id, invoice_id, source_role, referrer_privy_id, referred_privy_id, referral_code, token_type, reward_amount, status, payout_cycle_date, requested_at, paid_at, created_at')
          .order('created_at', { ascending: false })
          .limit(50), warnings)
      : [];

    const payoutRequests = canSee(admin, 'payout_requests')
      ? await safeQuery<Row>('payout requests', supabase
          .from('payout_requests')
          .select('id, privy_id, token_type, payout_wallet, amount, status, payout_cycle_date, request_deadline, requested_at, processed_at, admin_note')
          .order('requested_at', { ascending: false })
          .limit(50), warnings)
      : [];

    await logAdminAction(admin, 'admin_overview.view', 'admin_overview', null, {
      allowed_sections: admin.allowedSections,
    }).catch(error => console.error('Admin audit log error:', error));

    return res.status(200).json({
      admin: {
        privy_id: admin.role === 'owner' ? admin.privyId : maskIdentifier(admin.privyId),
        wallet_address: admin.role === 'owner' ? admin.walletAddress : shortWallet(admin.walletAddress),
        role: admin.role,
      },
      allowed_sections: admin.allowedSections,
      warnings,
      summary: {
        profiles: profiles.length,
        wallets: wallets.length,
        invoices: invoices.length,
        disputes: disputes.length,
        failed_emails: failedEmails.length,
        referral_rewards: referralRewards.length,
        payout_requests: payoutRequests.length,
        dispute_statuses: countByStatus(disputes),
        referral_statuses: countByStatus(referralRewards),
        payout_statuses: countByStatus(payoutRequests),
      },
      profiles: redactRows('profiles', profiles as Row[], admin.role),
      wallets: redactRows('wallets', wallets as Row[], admin.role),
      invoices: redactRows('invoices', invoices, admin.role),
      failed_emails: redactRows('failed_emails', failedEmails, admin.role),
      disputes: redactRows('disputes', disputes, admin.role),
      referral_rewards: redactRows('referral_rewards', referralRewards, admin.role),
      payout_requests: redactRows('payout_requests', payoutRequests, admin.role),
    });
  } catch (error) {
    console.error('Admin overview load error:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Admin data could not be loaded' });
  }
}
