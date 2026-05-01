import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  isValidSolanaAddress,
  normalizeSolanaAddress,
  supabase,
} from './_shared.js';

type TokenType = 'USDC' | 'SOL';

const X402_VERSION = 1;
const X402_NETWORK = 'solana:devnet';

function isEnabled(): boolean {
  return process.env.ENABLE_DEVNET_X402_ESCROW_INTENTS === 'true';
}

function getPayTo(): string | null {
  const payTo = process.env.DEVNET_X402_PAY_TO || process.env.DEVNET_AGENT_ALLOWED_WALLETS?.split(',')[0]?.trim();
  return payTo && isValidSolanaAddress(payTo) ? normalizeSolanaAddress(payTo) : null;
}

function getMaxAmountUsd(): number {
  const parsed = Number(process.env.DEVNET_AGENT_MAX_AMOUNT_USD ?? '25');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

function hasPaymentHeader(req: VercelRequest): boolean {
  const value = req.headers['x-payment'] ?? req.headers['X-PAYMENT'];
  return typeof value === 'string' && value.trim().length > 0;
}

function buildPaymentRequirements(input: {
  amount: number;
  tokenType: TokenType;
  payTo: string;
  description: string;
}) {
  return [{
    scheme: 'exact',
    network: X402_NETWORK,
    asset: input.tokenType,
    maxAmountRequired: input.amount.toString(),
    payTo: input.payTo,
    description: input.description,
    mimeType: 'application/json',
  }];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isEnabled()) return res.status(403).json({ error: 'Devnet x402 escrow intents are disabled' });

  const payTo = getPayTo();
  if (!payTo) return res.status(500).json({ error: 'Devnet x402 pay-to wallet is not configured' });

  const {
    invoiceId,
    creatorWallet,
    amount,
    tokenType = 'USDC',
    description = 'Truvlo devnet escrow intent',
  } = req.body as {
    invoiceId?: string;
    creatorWallet?: string;
    amount?: number;
    tokenType?: TokenType;
    description?: string;
  };

  if (!invoiceId || !creatorWallet || amount == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidSolanaAddress(creatorWallet)) {
    return res.status(400).json({ error: 'Invalid creator wallet' });
  }
  if (tokenType !== 'USDC' && tokenType !== 'SOL') {
    return res.status(400).json({ error: 'Invalid token type' });
  }
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (Number(amount) > getMaxAmountUsd()) {
    return res.status(403).json({ error: 'Devnet x402 amount cap exceeded' });
  }

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  const paymentRequirements = buildPaymentRequirements({
    amount: Number(amount),
    tokenType,
    payTo,
    description,
  });

  if (!hasPaymentHeader(req)) {
    return res.status(402).json({
      x402Version: X402_VERSION,
      error: 'Payment Required',
      paymentRequirements,
    });
  }

  const paymentPayload = req.headers['x-payment'] ?? req.headers['X-PAYMENT'];
  const { data, error } = await supabase
    .from('x402_escrow_intents')
    .upsert({
      invoice_id: invoiceId,
      creator_wallet: normalizedCreatorWallet,
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
