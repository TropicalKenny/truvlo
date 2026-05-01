import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  requireUserId,
  supabase,
  walletBelongsToUser,
} from './_shared.js';
import { EscrowPaySDK, TokenType } from '../src/lib/escrowPaySDK.js';

const VALID_VERIFICATION_STATUSES = ['pending', 'passed', 'failed', 'needs_human_review'] as const;
const VALID_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
const VALID_RECOMMENDED_ACTIONS = ['approve', 'dispute', 'manual_review'] as const;
const VALID_VERIFIER_TYPES = ['rule', 'ai', 'manual'] as const;
const X402_NETWORK = 'solana:devnet';

type VerificationStatus = typeof VALID_VERIFICATION_STATUSES[number];
type ConfidenceLevel = typeof VALID_CONFIDENCE_LEVELS[number];
type RecommendedAction = typeof VALID_RECOMMENDED_ACTIONS[number];
type VerifierType = typeof VALID_VERIFIER_TYPES[number];
type DevnetAgentAction = 'pay_invoice' | 'request_release' | 'approve_release' | 'raise_dispute';
type X402TokenType = 'USDC' | 'SOL';

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
}) {
  const successCriteria = input.successCriteria?.trim() ?? '';
  const deliverableUrl = input.deliverableUrl?.trim() ?? '';
  const proofText = input.proofText?.trim() ?? '';
  const proof = `${deliverableUrl} ${proofText}`.toLowerCase();

  if (!successCriteria || (!deliverableUrl && !proofText)) {
    return {
      verificationStatus: 'needs_human_review' as VerificationStatus,
      confidence: 'low' as ConfidenceLevel,
      summary: 'The job criteria or submitted proof is incomplete, so Truvlo cannot recommend release yet.',
      risks: 'Missing criteria or proof means the client should review manually before approving.',
      recommendedAction: 'manual_review' as RecommendedAction,
      verifierType: 'rule' as VerifierType,
    };
  }

  if (/\b(fail|failed|failing|broken|error|blocked|incomplete)\b/.test(proof)) {
    return {
      verificationStatus: 'failed' as VerificationStatus,
      confidence: 'medium' as ConfidenceLevel,
      summary: 'Submitted proof contains failure language that should be reviewed before release.',
      risks: 'The proof may indicate incomplete work or failing checks.',
      recommendedAction: 'manual_review' as RecommendedAction,
      verifierType: 'rule' as VerifierType,
    };
  }

  if (/\b(test|tests|passed|complete|completed|delivered|merged|live)\b/.test(proof)) {
    return {
      verificationStatus: 'passed' as VerificationStatus,
      confidence: 'medium' as ConfidenceLevel,
      summary: 'Submitted proof matches the basic completion checks for this agent-assisted escrow.',
      risks: 'This is a rule-based recommendation only; the client should still inspect the work.',
      recommendedAction: 'approve' as RecommendedAction,
      verifierType: 'rule' as VerifierType,
    };
  }

  return {
    verificationStatus: 'needs_human_review' as VerificationStatus,
    confidence: 'low' as ConfidenceLevel,
    summary: 'Proof was submitted, but the rule verifier could not confidently match it to completion.',
    risks: 'The client should inspect the deliverable before approving release.',
    recommendedAction: 'manual_review' as RecommendedAction,
    verifierType: 'rule' as VerifierType,
  };
}

export async function handleAgentVerifications(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    const invoiceId = typeof req.query.invoiceId === 'string' ? req.query.invoiceId.trim() : '';
    const creatorWallet = typeof req.query.creatorWallet === 'string' ? req.query.creatorWallet.trim() : '';
    if (!invoiceId || !creatorWallet) return res.status(400).json({ error: 'Missing required fields' });
    if (!isValidSolanaAddress(creatorWallet)) return res.status(400).json({ error: 'Invalid creator wallet' });

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
    return res.status(200).json({ invoice_meta: invoiceMeta, agent_verification: verification ?? null });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const userId = await requireUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const {
    invoiceId, creatorWallet, clientWallet, submittedByWallet,
    successCriteria, deliverableUrl, proofText,
    verificationStatus, confidence, summary, risks, recommendedAction, verifierType,
  } = req.body as Record<string, string | null | undefined>;

  if (!invoiceId || !creatorWallet || !submittedByWallet) return res.status(400).json({ error: 'Missing required fields' });
  if (!isValidSolanaAddress(creatorWallet) || !isValidSolanaAddress(submittedByWallet)) return res.status(400).json({ error: 'Invalid wallet address' });
  if (clientWallet && !isValidSolanaAddress(clientWallet)) return res.status(400).json({ error: 'Invalid client wallet' });
  if (verificationStatus && !isOneOf(VALID_VERIFICATION_STATUSES, verificationStatus)) return res.status(400).json({ error: 'Invalid verification status' });
  if (confidence && !isOneOf(VALID_CONFIDENCE_LEVELS, confidence)) return res.status(400).json({ error: 'Invalid confidence' });
  if (recommendedAction && !isOneOf(VALID_RECOMMENDED_ACTIONS, recommendedAction)) return res.status(400).json({ error: 'Invalid recommended action' });
  if (verifierType && !isOneOf(VALID_VERIFIER_TYPES, verifierType)) return res.status(400).json({ error: 'Invalid verifier type' });

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  const normalizedSubmitter = normalizeSolanaAddress(submittedByWallet);
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
  if (!isCreator && !isClient) return res.status(403).json({ error: 'Wallet is not a party to this invoice' });

  const criteria = asText(successCriteria) ?? invoiceMeta.success_criteria ?? null;
  const deliverable = asText(deliverableUrl) ?? invoiceMeta.deliverable_url ?? null;
  const proof = asText(proofText) ?? invoiceMeta.proof_text ?? null;
  const ruleResult = runRuleVerification({ successCriteria: criteria, deliverableUrl: deliverable, proofText: proof });

  const { data, error } = await supabase
    .from('agent_verifications')
    .upsert({
      invoice_id: invoiceId,
      creator_wallet: normalizedCreatorWallet,
      client_wallet: clientWallet ? normalizeSolanaAddress(clientWallet) : invoiceMeta.client_wallet ?? null,
      verification_status: verificationStatus ?? ruleResult.verificationStatus,
      confidence: confidence ?? ruleResult.confidence,
      summary: asText(summary) ?? ruleResult.summary,
      risks: asText(risks) ?? ruleResult.risks,
      recommended_action: recommendedAction ?? ruleResult.recommendedAction,
      verifier_type: verifierType ?? ruleResult.verifierType,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'invoice_id,creator_wallet' })
    .select('invoice_id, creator_wallet, client_wallet, verification_status, confidence, summary, risks, recommended_action, verifier_type, updated_at')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  await supabase
    .from('invoice_meta')
    .update({ success_criteria: criteria, deliverable_url: deliverable, proof_text: proof })
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet);

  return res.status(200).json({ success: true, agent_verification: data });
}

function assertDevnetAutomationEnabled(): string | null {
  const network = process.env.SOLANA_NETWORK || process.env.VITE_SOLANA_NETWORK || 'devnet';
  if (network !== 'devnet') return 'Devnet automation is only allowed on devnet';
  if (process.env.ENABLE_DEVNET_AGENT_MONEY_MOVEMENT !== 'true') return 'Devnet agent money movement is disabled';
  return null;
}

function getAgentKeypair(): Keypair | null {
  try {
    const raw = process.env.DEVNET_AGENT_SECRET_KEY;
    return raw ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[])) : null;
  } catch {
    return null;
  }
}

function isAllowedAgentWallet(wallet: string): boolean {
  return (process.env.DEVNET_AGENT_ALLOWED_WALLETS || '').split(',').map(value => value.trim()).includes(wallet);
}

function getMaxAmountUsd(): number {
  const parsed = Number(process.env.DEVNET_AGENT_MAX_AMOUNT_USD ?? '25');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

function toTokenType(value: unknown): TokenType | null {
  if (value === 'SOL') return TokenType.SOL;
  if (value === 'USDC') return TokenType.USDC;
  return null;
}

function createWallet(keypair: Keypair): Wallet {
  return {
    payer: keypair,
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => {
      if (tx instanceof VersionedTransaction) tx.sign([keypair]);
      else tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
      return Promise.all(txs.map(async tx => {
        if (tx instanceof VersionedTransaction) tx.sign([keypair]);
        else tx.partialSign(keypair);
        return tx;
      }));
    },
  };
}

export async function handleDevnetAgentActions(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const gateError = assertDevnetAutomationEnabled();
  if (gateError) return res.status(403).json({ error: gateError });

  const agentKeypair = getAgentKeypair();
  if (!agentKeypair) return res.status(500).json({ error: 'DEVNET_AGENT_SECRET_KEY is missing or invalid' });
  const agentWallet = agentKeypair.publicKey.toBase58();
  if (!isAllowedAgentWallet(agentWallet)) return res.status(403).json({ error: 'Devnet agent wallet is not allowlisted' });

  const { action, invoiceId, creatorWallet, tokenType, amount } = req.body as {
    action?: DevnetAgentAction; invoiceId?: string; creatorWallet?: string; tokenType?: 'USDC' | 'SOL'; amount?: number;
  };
  const actions: DevnetAgentAction[] = ['pay_invoice', 'request_release', 'approve_release', 'raise_dispute'];
  if (!action || !actions.includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!invoiceId || !creatorWallet) return res.status(400).json({ error: 'Missing required fields' });
  if (!isValidSolanaAddress(creatorWallet)) return res.status(400).json({ error: 'Invalid creator wallet' });

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  const { data: invoiceMeta, error: metaError } = await supabase
    .from('invoice_meta')
    .select('invoice_id, creator_wallet, client_wallet, token_type, amount')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet)
    .maybeSingle();
  if (metaError) return res.status(500).json({ error: metaError.message });
  if (!invoiceMeta) return res.status(404).json({ error: 'Invoice metadata not found' });

  const requestedAmount = Number(amount ?? invoiceMeta.amount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (requestedAmount > getMaxAmountUsd()) return res.status(403).json({ error: 'Devnet agent amount cap exceeded' });

  const { data: verification, error: verificationError } = await supabase
    .from('agent_verifications')
    .select('verification_status, recommended_action')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', normalizedCreatorWallet)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (verificationError) return res.status(500).json({ error: verificationError.message });
  if (action === 'request_release' && verification?.verification_status !== 'passed') return res.status(409).json({ error: 'Agent release request requires passed verification' });
  if (action === 'approve_release' && verification?.recommended_action !== 'approve') return res.status(409).json({ error: 'Agent approval requires recommended_action approve' });
  if (action === 'raise_dispute' && verification?.recommended_action !== 'dispute') return res.status(409).json({ error: 'Agent dispute requires recommended_action dispute' });
  if (action === 'request_release' && agentWallet !== invoiceMeta.creator_wallet) return res.status(403).json({ error: 'Agent wallet must be the invoice creator to request release' });
  if ((action === 'approve_release' || action === 'raise_dispute') && agentWallet !== invoiceMeta.client_wallet) return res.status(403).json({ error: 'Agent wallet must be the paying client to approve or dispute' });

  const connection = new Connection(process.env.VITE_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');
  const sdk = new EscrowPaySDK(new AnchorProvider(connection, createWallet(agentKeypair), { commitment: 'confirmed' }), false);
  if (!sdk.isInitialized()) return res.status(500).json({ error: sdk.getInitError() || 'SDK not initialized' });

  let result;
  if (action === 'pay_invoice') {
    const parsedTokenType = toTokenType(tokenType ?? invoiceMeta.token_type);
    if (parsedTokenType == null) return res.status(400).json({ error: 'Invalid token type' });
    result = await sdk.payInvoice(invoiceId, new PublicKey(normalizedCreatorWallet), requestedAmount, parsedTokenType);
  } else if (action === 'request_release') {
    result = await sdk.requestRelease(invoiceId, toTokenType(invoiceMeta.token_type) ?? undefined);
  } else if (action === 'approve_release') {
    result = await sdk.approveRelease(invoiceId, new PublicKey(normalizedCreatorWallet));
  } else {
    result = await sdk.raiseDispute(invoiceId, new PublicKey(normalizedCreatorWallet));
  }
  if (!result.success) return res.status(500).json({ error: result.error || 'Devnet agent action failed' });

  await supabase.from('devnet_agent_actions').insert({
    invoice_id: invoiceId,
    creator_wallet: normalizedCreatorWallet,
    agent_wallet: agentWallet,
    action,
    amount: requestedAmount,
    token_type: tokenType ?? invoiceMeta.token_type,
    signature: result.data?.signature ?? null,
    note: 'Truvlo devnet demo automation',
  });

  return res.status(200).json({ success: true, mode: 'Truvlo devnet demo automation', action, agent_wallet: agentWallet, signature: result.data?.signature });
}

function getPayTo(): string | null {
  const payTo = process.env.DEVNET_X402_PAY_TO || process.env.DEVNET_AGENT_ALLOWED_WALLETS?.split(',')[0]?.trim();
  return payTo && isValidSolanaAddress(payTo) ? normalizeSolanaAddress(payTo) : null;
}

function hasPaymentHeader(req: VercelRequest): boolean {
  const value = req.headers['x-payment'] ?? req.headers['X-PAYMENT'];
  return typeof value === 'string' && value.trim().length > 0;
}

export async function handleX402EscrowIntent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.ENABLE_DEVNET_X402_ESCROW_INTENTS !== 'true') return res.status(403).json({ error: 'Devnet x402 escrow intents are disabled' });

  const payTo = getPayTo();
  if (!payTo) return res.status(500).json({ error: 'Devnet x402 pay-to wallet is not configured' });

  const { invoiceId, creatorWallet, amount, tokenType = 'USDC', description = 'Truvlo devnet escrow intent' } = req.body as {
    invoiceId?: string; creatorWallet?: string; amount?: number; tokenType?: X402TokenType; description?: string;
  };
  if (!invoiceId || !creatorWallet || amount == null) return res.status(400).json({ error: 'Missing required fields' });
  if (!isValidSolanaAddress(creatorWallet)) return res.status(400).json({ error: 'Invalid creator wallet' });
  if (tokenType !== 'USDC' && tokenType !== 'SOL') return res.status(400).json({ error: 'Invalid token type' });
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (Number(amount) > getMaxAmountUsd()) return res.status(403).json({ error: 'Devnet x402 amount cap exceeded' });

  const paymentRequirements = [{
    scheme: 'exact',
    network: X402_NETWORK,
    asset: tokenType,
    maxAmountRequired: Number(amount).toString(),
    payTo,
    description,
    mimeType: 'application/json',
  }];

  if (!hasPaymentHeader(req)) return res.status(402).json({ x402Version: 1, error: 'Payment Required', paymentRequirements });

  const paymentPayload = req.headers['x-payment'] ?? req.headers['X-PAYMENT'];
  const { data, error } = await supabase
    .from('x402_escrow_intents')
    .upsert({
      invoice_id: invoiceId,
      creator_wallet: normalizeSolanaAddress(creatorWallet),
      payer_wallet: payTo,
      amount: Number(amount),
      token_type: tokenType,
      description,
      x402_network: X402_NETWORK,
      x402_scheme: 'exact',
      x402_payment_payload: typeof paymentPayload === 'string' ? paymentPayload : null,
      status: 'payment_submitted',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'invoice_id,creator_wallet' })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    success: true,
    mode: 'x402 devnet escrow intent',
    intent: data,
    next: 'Call /api/devnet-agent-actions with action pay_invoice to fund the devnet escrow using the configured agent wallet.',
  });
}
