import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared';

type DisputeDecision = 'creator' | 'client' | 'split';
type DisputeSide = 'creator' | 'client' | 'admin';

function parseDecision(value: unknown): DisputeDecision | null {
  return value === 'creator' || value === 'client' || value === 'split' ? value : null;
}

function getAdminPrivyIds(): string[] {
  const raw = process.env.DISPUTE_ADMIN_PRIVY_IDS || process.env.DISPUTE_ADMIN_PRIVY_ID || '';
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : null;
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }

    const { data: disputeCase, error } = await supabase
      .from('dispute_cases')
      .select('*')
      .eq('invoice_id', invoiceId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!disputeCase) return res.status(404).json({ error: 'Dispute case not found' });

    const { data: evidence, error: evidenceError } = await supabase
      .from('dispute_evidence')
      .select('*')
      .eq('case_id', disputeCase.id)
      .order('created_at', { ascending: true });

    if (evidenceError) return res.status(500).json({ error: evidenceError.message });
    return res.status(200).json({ dispute_case: disputeCase, evidence: evidence ?? [] });
  }

  if (req.method === 'POST') {
    const { action } = req.body as { action?: string };

    if (action === 'open') {
      const {
        invoiceId,
        creatorWallet,
        clientWallet,
        openedByWallet,
        openedByRole,
        evidenceDeadlineHours = 72,
      } = req.body as {
        invoiceId?: string;
        creatorWallet?: string;
        clientWallet?: string;
        openedByWallet?: string;
        openedByRole?: DisputeSide;
        evidenceDeadlineHours?: number;
      };

      if (!invoiceId || !creatorWallet || !openedByWallet || !openedByRole) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!isValidSolanaAddress(creatorWallet) || !isValidSolanaAddress(openedByWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      if (clientWallet && !isValidSolanaAddress(clientWallet)) {
        return res.status(400).json({ error: 'Invalid client wallet address' });
      }
      if (!(await walletBelongsToUser(supabase, userId, normalizeSolanaAddress(openedByWallet)))) {
        return res.status(403).json({ error: 'Opened-by wallet does not belong to the authenticated user' });
      }

      const evidenceDeadlineAt = new Date(Date.now() + Math.max(24, evidenceDeadlineHours) * 60 * 60 * 1000).toISOString();
      const { data: disputeCase, error } = await supabase
        .from('dispute_cases')
        .upsert(
          {
            invoice_id: invoiceId,
            creator_wallet: normalizeSolanaAddress(creatorWallet),
            client_wallet: clientWallet ? normalizeSolanaAddress(clientWallet) : null,
            opened_by_privy_id: userId,
            opened_by_role: openedByRole,
            status: 'open',
            evidence_deadline_at: evidenceDeadlineAt,
          },
          { onConflict: 'invoice_id' }
        )
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await supabase
        .from('invoice_meta')
        .update({ dispute_case_id: disputeCase.id })
        .eq('invoice_id', invoiceId)
        .eq('creator_wallet', normalizeSolanaAddress(creatorWallet));

      return res.status(200).json({ success: true, dispute_case: disputeCase });
    }

    if (action === 'evidence') {
      const {
        caseId,
        submittedByWallet,
        side,
        evidenceType,
        evidenceUrl,
        note,
      } = req.body as {
        caseId?: string;
        submittedByWallet?: string;
        side?: DisputeSide;
        evidenceType?: string;
        evidenceUrl?: string;
        note?: string;
      };

      if (!caseId || !submittedByWallet || !side || !evidenceType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!isValidSolanaAddress(submittedByWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      if (!(await walletBelongsToUser(supabase, userId, normalizeSolanaAddress(submittedByWallet)))) {
        return res.status(403).json({ error: 'Submitted wallet does not belong to the authenticated user' });
      }

      const { data: disputeCase, error: caseError } = await supabase
        .from('dispute_cases')
        .select('*')
        .eq('id', caseId)
        .maybeSingle();

      if (caseError) return res.status(500).json({ error: caseError.message });
      if (!disputeCase) return res.status(404).json({ error: 'Dispute case not found' });

      const { data: inserted, error } = await supabase
        .from('dispute_evidence')
        .insert({
          case_id: caseId,
          submitted_by_privy_id: userId,
          submitted_by_wallet: normalizeSolanaAddress(submittedByWallet),
          side,
          evidence_type: evidenceType,
          evidence_url: evidenceUrl || null,
          note: note || null,
        })
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await supabase
        .from('dispute_cases')
        .update({ status: 'under_review' })
        .eq('id', caseId);

      return res.status(200).json({ success: true, evidence: inserted });
    }

    if (action === 'resolve') {
      const adminIds = getAdminPrivyIds();
      if (adminIds.length === 0) {
        return res.status(503).json({ error: 'Dispute admin is not configured' });
      }
      if (!adminIds.includes(userId)) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const {
        caseId,
        decision,
        creatorShareBps,
        clientShareBps,
        verdictNote,
        verdictHash,
      } = req.body as {
        caseId?: string;
        decision?: DisputeDecision;
        creatorShareBps?: number;
        clientShareBps?: number;
        verdictNote?: string;
        verdictHash?: string;
      };

      const parsedDecision = parseDecision(decision);
      if (!caseId || !parsedDecision) {
        return res.status(400).json({ error: 'Missing caseId or invalid decision' });
      }

      const shares = parsedDecision === 'split'
        ? { creator: creatorShareBps ?? 0, client: clientShareBps ?? 0 }
        : parsedDecision === 'creator'
          ? { creator: 10000, client: 0 }
          : { creator: 0, client: 10000 };

      if (parsedDecision === 'split' && shares.creator + shares.client !== 10000) {
        return res.status(400).json({ error: 'Split shares must total 10000 bps' });
      }

      const { data, error } = await supabase
        .from('dispute_cases')
        .update({
          status: 'resolved',
          decision: parsedDecision,
          resolution_creator_bps: shares.creator,
          resolution_client_bps: shares.client,
          resolved_by_privy_id: userId,
          resolved_at: new Date().toISOString(),
          verdict_note: verdictNote || null,
          verdict_hash: verdictHash || null,
        })
        .eq('id', caseId)
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, dispute_case: data });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
