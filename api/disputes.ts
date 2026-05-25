import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';
import { logAdminAction, requireAdmin } from './_admin.js';
import { sendDisputeAdminAlerts } from './_admin-alerts.js';
import { DEFAULT_FROM_EMAIL, readResendError } from './_email.js';
import { escapeAttribute, escapeHtml, safeEmailSubject } from './_html.js';
import { resolveAppOrigin } from './_notify-client-origin.js';

type DisputeDecision = 'creator' | 'client' | 'split';
type DisputeSide = 'creator' | 'client' | 'admin';
type RecommendationConfidence = 'low' | 'medium' | 'high';
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || DEFAULT_FROM_EMAIL;
const APP_ORIGIN = process.env.APP_ORIGIN;
const MAX_EVIDENCE_DEADLINE_HOURS = 168;
const MAX_EVIDENCE_URL_LENGTH = 2048;
const MAX_EVIDENCE_NOTE_LENGTH = 4000;
const ALLOWED_EVIDENCE_TYPES = new Set(['deliverable_link', 'screenshot', 'transaction', 'conversation', 'other']);

function parseDecision(value: unknown): DisputeDecision | null {
  return value === 'creator' || value === 'client' || value === 'split' ? value : null;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function normalizeEvidenceUrl(value: unknown): string | null {
  const url = normalizeOptionalText(value, MAX_EVIDENCE_URL_LENGTH);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function getAdminPrivyIds(): string[] {
  const raw = process.env.DISPUTE_ADMIN_PRIVY_IDS || process.env.DISPUTE_ADMIN_PRIVY_ID || '';
  return raw
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

async function loadAdminFromRequest(req: VercelRequest, permission: 'disputes' | 'dispute_recommend' | 'dispute_resolve') {
  const wallet = typeof req.query.adminWallet === 'string'
    ? req.query.adminWallet
    : typeof req.body?.adminWallet === 'string'
      ? req.body.adminWallet
      : undefined;
  return requireAdmin(req, wallet, permission);
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function joinEvidence(
  evidence: Array<{ side?: string | null; evidence_type?: string | null; note?: string | null; evidence_url?: string | null }>,
  side: DisputeSide
) {
  return evidence
    .filter(row => row.side === side)
    .map(row => [row.evidence_type, row.note, row.evidence_url].filter(Boolean).join(' '))
    .join('\n')
    .toLowerCase();
}

function buildDisputeRecommendation(input: {
  invoiceMeta?: {
    description?: string | null;
    success_criteria?: string | null;
    deliverable_url?: string | null;
    proof_text?: string | null;
  } | null;
  evidence: Array<{ side?: string | null; evidence_type?: string | null; note?: string | null; evidence_url?: string | null }>;
  verification?: {
    verification_status?: string | null;
    recommended_action?: string | null;
    confidence?: string | null;
  } | null;
}): {
  decision: DisputeDecision;
  creatorShareBps: number;
  clientShareBps: number;
  confidence: RecommendationConfidence;
  note: string;
  risks: string;
} {
  const creatorEvidence = joinEvidence(input.evidence, 'creator');
  const clientEvidence = joinEvidence(input.evidence, 'client');
  const adminEvidence = joinEvidence(input.evidence, 'admin');
  const proofText = [
    input.invoiceMeta?.description,
    input.invoiceMeta?.success_criteria,
    input.invoiceMeta?.deliverable_url,
    input.invoiceMeta?.proof_text,
    creatorEvidence,
    adminEvidence,
  ].filter(Boolean).join('\n').toLowerCase();

  const completionSignals = [/\bcomplete(d)?\b/, /\bdelivered\b/, /\bmerged\b/, /\blive\b/, /\bapproved\b/, /\bpassed\b/, /\bproof\b/];
  const failureSignals = [/\bincomplete\b/, /\bnot delivered\b/, /\bbroken\b/, /\bfailed\b/, /\berror\b/, /\brefund\b/, /\bmissing\b/, /\bscam\b/];

  const hasCreatorEvidence = creatorEvidence.trim().length > 0 || Boolean(input.invoiceMeta?.proof_text || input.invoiceMeta?.deliverable_url);
  const hasClientEvidence = clientEvidence.trim().length > 0;
  const agentPassed = input.verification?.verification_status === 'passed' && input.verification?.recommended_action === 'approve';
  const agentFlagged = input.verification?.verification_status === 'failed' || input.verification?.recommended_action === 'dispute';
  const proofLooksComplete = includesAny(proofText, completionSignals);
  const clientShowsFailure = includesAny(clientEvidence, failureSignals);

  if (agentPassed && !clientShowsFailure) {
    return {
      decision: 'creator',
      creatorShareBps: 10000,
      clientShareBps: 0,
      confidence: input.verification?.confidence === 'high' ? 'high' : 'medium',
      note: 'Truvlo recommends releasing funds to the creator because the submitted proof passed agent-assisted verification and no strong client failure evidence was found.',
      risks: 'Admin must still confirm the deliverable and evidence before resolving funds.',
    };
  }

  if (agentFlagged && clientShowsFailure) {
    return {
      decision: 'client',
      creatorShareBps: 0,
      clientShareBps: 10000,
      confidence: 'medium',
      note: 'Truvlo recommends refunding the client because agent verification flagged the work and client evidence contains failure or refund signals.',
      risks: 'Admin should verify that the client evidence directly relates to the agreed scope before resolving.',
    };
  }

  if (hasCreatorEvidence && proofLooksComplete && !hasClientEvidence) {
    return {
      decision: 'creator',
      creatorShareBps: 10000,
      clientShareBps: 0,
      confidence: 'medium',
      note: 'Truvlo recommends creator-favored resolution because creator proof suggests completion and the client has not submitted contrary evidence.',
      risks: 'This recommendation is evidence-asymmetric; admin should give the client a fair chance to respond if the evidence window is still open.',
    };
  }

  if (!hasCreatorEvidence && hasClientEvidence && clientShowsFailure) {
    return {
      decision: 'client',
      creatorShareBps: 0,
      clientShareBps: 10000,
      confidence: 'medium',
      note: 'Truvlo recommends client-favored resolution because client evidence alleges non-delivery or failure and no creator proof is present.',
      risks: 'This recommendation is evidence-asymmetric; admin should confirm creator evidence is actually absent before resolving.',
    };
  }

  if (hasCreatorEvidence && hasClientEvidence) {
    return {
      decision: 'split',
      creatorShareBps: 5000,
      clientShareBps: 5000,
      confidence: 'low',
      note: 'Truvlo recommends a split review because both parties submitted evidence and the rule-based evaluator cannot safely pick a full winner.',
      risks: 'Admin should read both sides and adjust the split before final resolution.',
    };
  }

  return {
    decision: 'split',
    creatorShareBps: 5000,
    clientShareBps: 5000,
    confidence: 'low',
    note: 'Truvlo recommends manual split review because there is not enough evidence for a confident creator or client outcome.',
    risks: 'Do not resolve until the admin has reviewed missing proof, client objections, and the original scope.',
  };
}

function formatShare(bps: unknown): string {
  const numeric = Number(bps ?? 0);
  if (!Number.isFinite(numeric)) return '0%';
  return `${(numeric / 100).toFixed(numeric % 100 === 0 ? 0 : 2)}%`;
}

function buildExplorerUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
}

function buildResolutionEmail(input: {
  recipientRole: 'creator' | 'client';
  invoiceId: string;
  tokenType: string;
  amount: string;
  decision: string;
  creatorShareBps: number;
  clientShareBps: number;
  resolutionSignature: string;
  verdictHashSignature: string;
  dashboardUrl: string;
}) {
  const recipientShare = input.recipientRole === 'creator'
    ? input.creatorShareBps
    : input.clientShareBps;
  const counterpartyShare = input.recipientRole === 'creator'
    ? input.clientShareBps
    : input.creatorShareBps;
  const headline = input.decision === 'split'
    ? 'Dispute resolved with a split'
    : input.decision === input.recipientRole
      ? 'Dispute resolved in your favor'
      : 'Dispute resolved';
  const shareLabel = input.recipientRole === 'creator' ? 'Creator share' : 'Client share';
  const otherShareLabel = input.recipientRole === 'creator' ? 'Client share' : 'Creator share';
  const explorerUrl = buildExplorerUrl(input.resolutionSignature);
  const verdictUrl = buildExplorerUrl(input.verdictHashSignature);

  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px;">
    <div style="background:#0D1117;border-radius:16px;padding:28px;border:1px solid rgba(255,255,255,0.08);">
      <div style="font-size:20px;font-weight:700;color:#F8FAFC;margin-bottom:16px;">Truvlo</div>
      <h1 style="margin:0 0 8px;font-size:22px;color:#F8FAFC;">${escapeHtml(headline)}</h1>
      <p style="margin:0 0 20px;color:#94A3B8;line-height:1.6;">
        The dispute for invoice <strong style="color:#F8FAFC;">${escapeHtml(input.invoiceId)}</strong> has been resolved on devnet.
        Funds were moved by the on-chain resolution transaction.
      </p>
      <div style="background:#161B22;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px 18px;margin-bottom:20px;">
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Invoice</div>
        <div style="color:#F8FAFC;font-family:monospace;margin-top:4px;">${escapeHtml(input.invoiceId)}</div>
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Amount</div>
        <div style="color:#F8FAFC;font-size:22px;font-weight:700;margin-top:4px;">${escapeHtml(input.amount)} ${escapeHtml(input.tokenType)}</div>
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">Outcome</div>
        <div style="color:#F8FAFC;margin-top:4px;text-transform:capitalize;">${escapeHtml(input.decision)}</div>
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">${escapeHtml(shareLabel)}</div>
        <div style="color:#F8FAFC;margin-top:4px;">${formatShare(recipientShare)}</div>
        <div style="font-size:12px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;margin-top:14px;">${escapeHtml(otherShareLabel)}</div>
        <div style="color:#94A3B8;margin-top:4px;">${formatShare(counterpartyShare)}</div>
      </div>
      <div style="background:#1C2128;border-left:3px solid #2DD4BF;border-radius:10px;padding:14px 16px;margin-bottom:20px;">
        <div style="color:#F8FAFC;font-size:13px;font-weight:600;margin-bottom:4px;">Resolution proof</div>
        <div style="color:#94A3B8;font-size:13px;line-height:1.6;">
          Resolution transaction:
          <a href="${explorerUrl}" style="color:#2DD4BF;word-break:break-all;">${escapeHtml(input.resolutionSignature)}</a><br>
          Verdict hash transaction:
          <a href="${verdictUrl}" style="color:#2DD4BF;word-break:break-all;">${escapeHtml(input.verdictHashSignature)}</a>
        </div>
      </div>
      <a href="${escapeAttribute(input.dashboardUrl)}" style="display:inline-block;background:#2DD4BF;color:#0D1117;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600;">Open Dashboard</a>
    </div>
  </div>
</body>
</html>`.trim();
}

async function sendDisputeResolutionEmails(input: {
  req: VercelRequest;
  disputeCase: Record<string, unknown>;
}) {
  if (!RESEND_API_KEY) return;

  const invoiceId = String(input.disputeCase.invoice_id ?? '');
  const creatorWallet = String(input.disputeCase.creator_wallet ?? '');
  const resolutionSignature = String(input.disputeCase.resolution_signature ?? '');
  const verdictHashSignature = String(input.disputeCase.verdict_hash_signature ?? '');
  if (!invoiceId || !creatorWallet || !resolutionSignature || !verdictHashSignature) return;

  const { data: invoiceMeta, error } = await supabase
    .from('invoice_meta')
    .select('creator_email, client_email, token_type, amount')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', creatorWallet)
    .maybeSingle();

  if (error) {
    console.error('Dispute resolution email metadata lookup failed:', error);
    return;
  }

  const appOrigin = resolveAppOrigin({
    envOrigin: APP_ORIGIN,
    deploymentUrl: process.env.CF_PAGES_URL
      || process.env.CLOUDFLARE_PAGES_URL
      || process.env.VERCEL_PROJECT_PRODUCTION_URL
      || process.env.VERCEL_URL,
    headers: input.req.headers,
  });
  const dashboardUrl = appOrigin ? `${appOrigin}/dashboard` : 'https://truvlo.io/dashboard';

  const decision = String(input.disputeCase.decision ?? 'split');
  const tokenType = String(invoiceMeta?.token_type ?? '');
  const amount = String(invoiceMeta?.amount ?? '');
  const creatorShareBps = Number(input.disputeCase.resolution_creator_bps ?? 0);
  const clientShareBps = Number(input.disputeCase.resolution_client_bps ?? 0);

  const recipients = [
    { role: 'creator' as const, email: invoiceMeta?.creator_email },
    { role: 'client' as const, email: invoiceMeta?.client_email },
  ].filter(row => typeof row.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email));

  await Promise.all(recipients.map(async recipient => {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Truvlo <${FROM_EMAIL}>`,
        to: [recipient.email],
        subject: `Dispute resolved - ${safeEmailSubject(invoiceId)}`,
        html: buildResolutionEmail({
          recipientRole: recipient.role,
          invoiceId,
          tokenType,
          amount,
          decision,
          creatorShareBps,
          clientShareBps,
          resolutionSignature,
          verdictHashSignature,
          dashboardUrl,
        }),
      }),
    });

    if (!response.ok) {
      const resendError = await readResendError(response);
      console.error(`Resend error (dispute resolution ${recipient.role}):`, resendError);
    }
  }));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const adminIds = getAdminPrivyIds();
  const requestAdmin = await loadAdminFromRequest(req, 'disputes');
  const isAdmin = Boolean(requestAdmin) || adminIds.includes(userId);

  // ─────────────────────────────────────────────────────────────────
  // GET /api/disputes?invoiceId=...
  // FIX: Authorize that the caller is a party to the dispute or admin.
  // ─────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId : null;
    const creatorWallet = typeof req.query.creatorWallet === 'string' ? req.query.creatorWallet : null;
    if (!invoiceId) {
      return res.status(400).json({ error: 'invoiceId is required' });
    }
    if (creatorWallet && !isValidSolanaAddress(creatorWallet)) {
      return res.status(400).json({ error: 'Invalid creator wallet' });
    }

    let disputeQuery = supabase
      .from('dispute_cases')
      .select('*')
      .eq('invoice_id', invoiceId);
    if (creatorWallet) {
      disputeQuery = disputeQuery.eq('creator_wallet', normalizeSolanaAddress(creatorWallet));
    }
    const { data: disputeCase, error } = await disputeQuery.maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!disputeCase) return res.status(404).json({ error: 'Dispute case not found' });

    // FIX: Verify the caller is the creator, client, or admin before returning any data.
    const isCreator = disputeCase.creator_privy_id === userId;
    // client_privy_id may be null for older cases; fall back to wallet ownership check.
    const isClient =
      disputeCase.client_privy_id === userId ||
      (disputeCase.client_wallet &&
        (await walletBelongsToUser(supabase, userId, disputeCase.client_wallet)));

    if (!isCreator && !isClient && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to view this dispute' });
    }

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

    // ─────────────────────────────────────────────────────────────────
    // POST action=open
    // FIX 1: Replace upsert with insert — fail if a case already exists.
    // FIX 2: Verify openedByWallet is a party to the invoice from invoice_meta.
    // FIX 3: Derive openedByRole from the verified wallet match, not from input.
    // ─────────────────────────────────────────────────────────────────
    if (action === 'open') {
      const {
        invoiceId,
        openedByWallet,
        evidenceDeadlineHours = 72,
      } = req.body as {
        invoiceId?: string;
        openedByWallet?: string;
        evidenceDeadlineHours?: number;
      };

      if (!invoiceId || !openedByWallet) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!isValidSolanaAddress(openedByWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      const normalizedOpener = normalizeSolanaAddress(openedByWallet);

      // FIX: Verify opener is a party to this invoice; derive role server-side.
      const { data: invoiceMeta, error: metaError } = await supabase
        .from('invoice_meta')
        .select('creator_wallet, client_wallet, creator_privy_id, client_privy_id')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (metaError) return res.status(500).json({ error: metaError.message });
      if (!invoiceMeta) return res.status(404).json({ error: 'Invoice not found' });

      let derivedRole: 'creator' | 'client';
      let openerIsAuthorized = await walletBelongsToUser(supabase, userId, normalizedOpener);
      if (invoiceMeta.creator_wallet === normalizedOpener) {
        derivedRole = 'creator';
      } else if (invoiceMeta.client_wallet === normalizedOpener) {
        derivedRole = 'client';
      } else {
        const { data: policy } = await supabase
          .from('agent_policies')
          .select('client_privy_id, agent_wallet, status')
          .eq('invoice_id', invoiceId)
          .eq('creator_wallet', invoiceMeta.creator_wallet)
          .eq('agent_wallet', normalizedOpener)
          .maybeSingle();
        if (policy?.status === 'active' && policy.client_privy_id === userId) {
          openerIsAuthorized = true;
          derivedRole = 'client';
        } else {
          return res.status(403).json({ error: 'Wallet is not a party to this invoice' });
        }
      }

      if (!openerIsAuthorized) {
        return res.status(403).json({ error: 'Opened-by wallet does not belong to the authenticated user' });
      }

      const deadlineHours = Number.isFinite(evidenceDeadlineHours)
        ? Math.min(MAX_EVIDENCE_DEADLINE_HOURS, Math.max(24, evidenceDeadlineHours))
        : 72;
      const evidenceDeadlineAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000).toISOString();

      // FIX: Use insert instead of upsert so an existing dispute cannot be overwritten.
      const { data: disputeCase, error } = await supabase
        .from('dispute_cases')
        .insert({
          invoice_id: invoiceId,
          creator_wallet: invoiceMeta.creator_wallet,
          client_wallet: invoiceMeta.client_wallet ?? null,
          creator_privy_id: invoiceMeta.creator_privy_id ?? null,
          client_privy_id: invoiceMeta.client_privy_id ?? null,
          opened_by_privy_id: userId,
          opened_by_role: derivedRole,
          status: 'open',
          evidence_deadline_at: evidenceDeadlineAt,
        })
        .select('*')
        .single();

      if (error) {
        // Postgres unique_violation — a case already exists for this invoice.
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('dispute_cases')
            .select('*')
            .eq('invoice_id', invoiceId)
            .maybeSingle();
          return res.status(200).json({ success: true, already_exists: true, dispute_case: existing });
        }
        return res.status(500).json({ error: error.message });
      }

      await supabase
        .from('invoice_meta')
        .update({ dispute_case_id: disputeCase.id })
        .eq('invoice_id', invoiceId)
        .eq('creator_wallet', invoiceMeta.creator_wallet);

      await sendDisputeAdminAlerts({
        invoiceId,
        creatorWallet: invoiceMeta.creator_wallet,
        clientWallet: invoiceMeta.client_wallet ?? null,
        openedByRole: derivedRole,
        status: 'open',
        openedAt: disputeCase.opened_at ?? new Date().toISOString(),
      });

      return res.status(200).json({ success: true, dispute_case: disputeCase });
    }

    // ─────────────────────────────────────────────────────────────────
    // POST action=evidence
    // FIX: Derive `side` from server-validated wallet match, not from input.
    // ─────────────────────────────────────────────────────────────────
    if (action === 'evidence') {
      const {
        caseId,
        submittedByWallet,
        evidenceType,
        evidenceUrl,
        note,
      } = req.body as {
        caseId?: string;
        submittedByWallet?: string;
        // `side` is intentionally NOT destructured — we derive it server-side.
        evidenceType?: string;
        evidenceUrl?: string;
        note?: string;
      };

      if (!caseId || !submittedByWallet || !evidenceType) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      if (!ALLOWED_EVIDENCE_TYPES.has(evidenceType)) {
        return res.status(400).json({ error: 'Invalid evidence type' });
      }
      if (!isValidSolanaAddress(submittedByWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      const normalizedEvidenceUrl = normalizeEvidenceUrl(evidenceUrl);
      const normalizedNote = normalizeOptionalText(note, MAX_EVIDENCE_NOTE_LENGTH);
      if (evidenceUrl && !normalizedEvidenceUrl) {
        return res.status(400).json({ error: 'Evidence link must be a valid http or https URL' });
      }
      if (!normalizedEvidenceUrl && !normalizedNote) {
        return res.status(400).json({ error: 'Add a note or evidence link before submitting' });
      }

      const normalizedSubmitter = normalizeSolanaAddress(submittedByWallet);

      if (!(await walletBelongsToUser(supabase, userId, normalizedSubmitter))) {
        return res.status(403).json({ error: 'Submitted wallet does not belong to the authenticated user' });
      }

      const { data: disputeCase, error: caseError } = await supabase
        .from('dispute_cases')
        .select('*')
        .eq('id', caseId)
        .maybeSingle();

      if (caseError) return res.status(500).json({ error: caseError.message });
      if (!disputeCase) return res.status(404).json({ error: 'Dispute case not found' });

      // FIX: Derive side from the authenticated wallet's role in this dispute.
      let derivedSide: DisputeSide;
      if (isAdmin) {
        derivedSide = 'admin';
      } else if (normalizedSubmitter === disputeCase.creator_wallet) {
        derivedSide = 'creator';
      } else if (normalizedSubmitter === disputeCase.client_wallet || disputeCase.client_privy_id === userId) {
        derivedSide = 'client';
      } else {
        return res.status(403).json({ error: 'Wallet is not a party to this dispute' });
      }

      const { data: inserted, error } = await supabase
        .from('dispute_evidence')
        .insert({
          case_id: caseId,
          submitted_by_privy_id: userId,
          submitted_by_wallet: normalizedSubmitter,
          side: derivedSide,          // server-derived, not caller-supplied
          evidence_type: evidenceType,
          evidence_url: normalizedEvidenceUrl,
          note: normalizedNote,
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

    if (action === 'recommend') {
      const admin = await loadAdminFromRequest(req, 'dispute_recommend');
      if (!admin && !isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { caseId } = req.body as { caseId?: string };
      if (!caseId) {
        return res.status(400).json({ error: 'caseId is required' });
      }

      const { data: disputeCase, error: caseError } = await supabase
        .from('dispute_cases')
        .select('*')
        .eq('id', caseId)
        .maybeSingle();

      if (caseError) return res.status(500).json({ error: caseError.message });
      if (!disputeCase) return res.status(404).json({ error: 'Dispute case not found' });
      if (disputeCase.status === 'resolved' || disputeCase.status === 'closed') {
        return res.status(409).json({ error: 'Cannot recommend a resolved or closed dispute' });
      }

      const [{ data: evidence, error: evidenceError }, { data: invoiceMeta }, { data: verification }] = await Promise.all([
        supabase
          .from('dispute_evidence')
          .select('side, evidence_type, evidence_url, note')
          .eq('case_id', caseId)
          .order('created_at', { ascending: true }),
        supabase
          .from('invoice_meta')
          .select('description, success_criteria, deliverable_url, proof_text')
          .eq('invoice_id', disputeCase.invoice_id)
          .eq('creator_wallet', disputeCase.creator_wallet)
          .maybeSingle(),
        supabase
          .from('agent_verifications')
          .select('verification_status, recommended_action, confidence')
          .eq('invoice_id', disputeCase.invoice_id)
          .eq('creator_wallet', disputeCase.creator_wallet)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (evidenceError) return res.status(500).json({ error: evidenceError.message });

      const recommendation = buildDisputeRecommendation({
        invoiceMeta,
        evidence: evidence ?? [],
        verification,
      });

      const { data, error } = await supabase
        .from('dispute_cases')
        .update({
          status: 'under_review',
          recommendation_decision: recommendation.decision,
          recommendation_creator_bps: recommendation.creatorShareBps,
          recommendation_client_bps: recommendation.clientShareBps,
          recommendation_confidence: recommendation.confidence,
          recommendation_note: recommendation.note,
          recommendation_risks: recommendation.risks,
          recommendation_generated_by_privy_id: userId,
          recommendation_generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId)
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });

      if (admin) {
        await logAdminAction(admin, 'dispute.recommend', 'dispute_case', caseId, {
          decision: recommendation.decision,
          creator_share_bps: recommendation.creatorShareBps,
          client_share_bps: recommendation.clientShareBps,
          confidence: recommendation.confidence,
        }).catch(logError => console.error('Admin audit log error:', logError));
      }

      return res.status(200).json({ success: true, dispute_case: data, recommendation });
    }

    // ─────────────────────────────────────────────────────────────────
    // POST action=resolve  (unchanged — already admin-gated)
    // ─────────────────────────────────────────────────────────────────
    if (action === 'resolve') {
      const admin = await loadAdminFromRequest(req, 'dispute_resolve');
      if (!admin && adminIds.length === 0) {
        return res.status(503).json({ error: 'Dispute admin is not configured' });
      }
      if (!admin && !isAdmin) {
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
      if (admin) {
        await logAdminAction(admin, 'dispute.resolve', 'dispute_case', caseId, {
          decision: parsedDecision,
          creator_share_bps: shares.creator,
          client_share_bps: shares.client,
        }).catch(logError => console.error('Admin audit log error:', logError));
      }
      return res.status(200).json({ success: true, dispute_case: data });
    }

    if (action === 'mark_onchain_resolved') {
      const admin = await loadAdminFromRequest(req, 'dispute_resolve');
      if (!admin && !isAdmin) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const {
        caseId,
        verdictHashSignature,
        resolutionSignature,
      } = req.body as {
        caseId?: string;
        verdictHashSignature?: string;
        resolutionSignature?: string;
      };

      if (!caseId || !verdictHashSignature || !resolutionSignature) {
        return res.status(400).json({ error: 'Missing on-chain resolution signatures' });
      }

      const { data, error } = await supabase
        .from('dispute_cases')
        .update({
          verdict_hash_signature: verdictHashSignature,
          resolution_signature: resolutionSignature,
          onchain_resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', caseId)
        .select('*')
        .single();

      if (error) return res.status(500).json({ error: error.message });
      if (admin) {
        await logAdminAction(admin, 'dispute.onchain_resolve', 'dispute_case', caseId, {
          verdict_hash_signature: verdictHashSignature,
          resolution_signature: resolutionSignature,
        }).catch(logError => console.error('Admin audit log error:', logError));
      }
      await sendDisputeResolutionEmails({ req, disputeCase: data as Record<string, unknown> })
        .catch(emailError => console.error('Dispute resolution email send failed:', emailError));
      return res.status(200).json({ success: true, dispute_case: data });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
