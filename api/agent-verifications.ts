import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';

const VALID_VERIFICATION_STATUSES = ['pending', 'passed', 'failed', 'needs_human_review'] as const;
const VALID_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
const VALID_RECOMMENDED_ACTIONS = ['approve', 'dispute', 'manual_review'] as const;
const VALID_VERIFIER_TYPES = ['rule', 'ai', 'manual'] as const;

type VerificationStatus = typeof VALID_VERIFICATION_STATUSES[number];
type ConfidenceLevel = typeof VALID_CONFIDENCE_LEVELS[number];
type RecommendedAction = typeof VALID_RECOMMENDED_ACTIONS[number];
type VerifierType = typeof VALID_VERIFIER_TYPES[number];

function isOneOf<T extends readonly string[]>(allowed: T, value: unknown): value is T[number] {
  return typeof value === 'string' && allowed.includes(value);
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function runRuleVerification(input: {
  successCriteria?: string | null;
  deliverableUrl?: string | null;
  proofText?: string | null;
}): {
  verificationStatus: VerificationStatus;
  confidence: ConfidenceLevel;
  summary: string;
  risks: string;
  recommendedAction: RecommendedAction;
  verifierType: VerifierType;
} {
  const successCriteria = input.successCriteria?.trim() ?? '';
  const deliverableUrl = input.deliverableUrl?.trim() ?? '';
  const proofText = input.proofText?.trim() ?? '';
  const proof = `${deliverableUrl} ${proofText}`.toLowerCase();

  if (!successCriteria || (!deliverableUrl && !proofText)) {
    return {
      verificationStatus: 'needs_human_review',
      confidence: 'low',
      summary: 'The job criteria or submitted proof is incomplete, so Truvlo cannot recommend release yet.',
      risks: 'Missing criteria or proof means the client should review manually before approving.',
      recommendedAction: 'manual_review',
      verifierType: 'rule',
    };
  }

  if (/\b(fail|failed|failing|broken|error|blocked|incomplete)\b/.test(proof)) {
    return {
      verificationStatus: 'failed',
      confidence: 'medium',
      summary: 'Submitted proof contains failure language that should be reviewed before release.',
      risks: 'The proof may indicate incomplete work or failing checks.',
      recommendedAction: 'manual_review',
      verifierType: 'rule',
    };
  }

  if (/\b(test|tests|passed|complete|completed|delivered|merged|live)\b/.test(proof)) {
    return {
      verificationStatus: 'passed',
      confidence: 'medium',
      summary: 'Submitted proof matches the basic completion checks for this agent-assisted escrow.',
      risks: 'This is a rule-based recommendation only; the client should still inspect the work.',
      recommendedAction: 'approve',
      verifierType: 'rule',
    };
  }

  return {
    verificationStatus: 'needs_human_review',
    confidence: 'low',
    summary: 'Proof was submitted, but the rule verifier could not confidently match it to completion.',
    risks: 'The client should inspect the deliverable before approving release.',
    recommendedAction: 'manual_review',
    verifierType: 'rule',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId.trim() : '';
    const creatorWallet = typeof req.query.creatorWallet === 'string' ? req.query.creatorWallet.trim() : '';

    if (!invoiceId || !creatorWallet) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isValidSolanaAddress(creatorWallet)) {
      return res.status(400).json({ error: 'Invalid creator wallet' });
    }

    const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
    const { data: invoiceMeta, error: metaError } = await supabase
      .from('invoice_meta')
      .select('invoice_id, creator_wallet, job_type, verification_mode, success_criteria, deliverable_url, proof_text')
      .eq('invoice_id', invoiceId)
      .eq('creator_wallet', normalizedCreatorWallet)
      .maybeSingle();

    if (metaError) return res.status(500).json({ error: 'Failed to load invoice metadata' });
    if (!invoiceMeta) return res.status(404).json({ error: 'Invoice metadata not found' });

    const { data: verification, error } = await supabase
      .from('agent_verifications')
      .select('invoice_id, creator_wallet, client_wallet, verification_status, confidence, summary, risks, recommended_action, verifier_type, updated_at')
      .eq('invoice_id', invoiceId)
      .eq('creator_wallet', normalizedCreatorWallet)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return res.status(500).json({ error: 'Failed to load agent verification' });

    return res.status(200).json({
      invoice_meta: invoiceMeta,
      agent_verification: verification ?? null,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const {
    invoiceId,
    creatorWallet,
    clientWallet,
    submittedByWallet,
    successCriteria,
    deliverableUrl,
    proofText,
    verificationStatus,
    confidence,
    summary,
    risks,
    recommendedAction,
    verifierType,
  } = req.body as {
    invoiceId?: string;
    creatorWallet?: string;
    clientWallet?: string | null;
    submittedByWallet?: string;
    successCriteria?: string;
    deliverableUrl?: string;
    proofText?: string;
    verificationStatus?: string;
    confidence?: string;
    summary?: string;
    risks?: string;
    recommendedAction?: string;
    verifierType?: string;
  };

  if (!invoiceId || !creatorWallet || !submittedByWallet) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidSolanaAddress(creatorWallet) || !isValidSolanaAddress(submittedByWallet)) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }
  if (clientWallet && !isValidSolanaAddress(clientWallet)) {
    return res.status(400).json({ error: 'Invalid client wallet' });
  }
  if (verificationStatus && !isOneOf(VALID_VERIFICATION_STATUSES, verificationStatus)) {
    return res.status(400).json({ error: 'Invalid verification status' });
  }
  if (confidence && !isOneOf(VALID_CONFIDENCE_LEVELS, confidence)) {
    return res.status(400).json({ error: 'Invalid confidence' });
  }
  if (recommendedAction && !isOneOf(VALID_RECOMMENDED_ACTIONS, recommendedAction)) {
    return res.status(400).json({ error: 'Invalid recommended action' });
  }
  if (verifierType && !isOneOf(VALID_VERIFIER_TYPES, verifierType)) {
    return res.status(400).json({ error: 'Invalid verifier type' });
  }

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  const normalizedSubmitter = normalizeSolanaAddress(submittedByWallet);
  const normalizedClientWallet = clientWallet ? normalizeSolanaAddress(clientWallet) : null;

  if (!(await walletBelongsToUser(supabase, userId, normalizedSubmitter))) {
    return res.status(403).json({ error: 'Submitted wallet does not belong to the authenticated user' });
  }

  const { data: invoiceMeta, error: metaError } = await supabase
    .from('invoice_meta')
    .select('creator_wallet, client_wallet, success_criteria, deliverable_url, proof_text')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet)
    .maybeSingle();

  if (metaError) return res.status(500).json({ error: metaError.message });
  if (!invoiceMeta) return res.status(404).json({ error: 'Invoice not found' });

  const isCreator = invoiceMeta.creator_wallet === normalizedSubmitter;
  const isClient = invoiceMeta.client_wallet === normalizedSubmitter;
  if (!isCreator && !isClient) {
    return res.status(403).json({ error: 'Wallet is not a party to this invoice' });
  }

  const criteria = asText(successCriteria) ?? invoiceMeta.success_criteria ?? null;
  const deliverable = asText(deliverableUrl) ?? invoiceMeta.deliverable_url ?? null;
  const proof = asText(proofText) ?? invoiceMeta.proof_text ?? null;
  const ruleResult = runRuleVerification({
    successCriteria: criteria,
    deliverableUrl: deliverable,
    proofText: proof,
  });

  const payload = {
    invoice_id: invoiceId,
    creator_wallet: normalizedCreatorWallet,
    client_wallet: normalizedClientWallet ?? invoiceMeta.client_wallet ?? null,
    verification_status: (verificationStatus as VerificationStatus | undefined) ?? ruleResult.verificationStatus,
    confidence: (confidence as ConfidenceLevel | undefined) ?? ruleResult.confidence,
    summary: asText(summary) ?? ruleResult.summary,
    risks: asText(risks) ?? ruleResult.risks,
    recommended_action: (recommendedAction as RecommendedAction | undefined) ?? ruleResult.recommendedAction,
    verifier_type: (verifierType as VerifierType | undefined) ?? ruleResult.verifierType,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('agent_verifications')
    .upsert(payload, { onConflict: 'invoice_id,creator_wallet' })
    .select('invoice_id, creator_wallet, client_wallet, verification_status, confidence, summary, risks, recommended_action, verifier_type, updated_at')
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await supabase
    .from('invoice_meta')
    .update({
      success_criteria: criteria,
      deliverable_url: deliverable,
      proof_text: proof,
    })
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet);

  return res.status(200).json({ success: true, agent_verification: data });
}
