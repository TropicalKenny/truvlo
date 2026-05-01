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
  supabase,
} from './_shared.js';
import { EscrowPaySDK, TokenType } from '../src/lib/escrowPaySDK.js';

type DevnetAgentAction = 'pay_invoice' | 'request_release' | 'approve_release' | 'raise_dispute';

const ACTIONS: DevnetAgentAction[] = ['pay_invoice', 'request_release', 'approve_release', 'raise_dispute'];

function assertDevnetAutomationEnabled(): string | null {
  const network = process.env.SOLANA_NETWORK || process.env.VITE_SOLANA_NETWORK || 'devnet';
  if (network !== 'devnet') return 'Devnet automation is only allowed on devnet';
  if (process.env.ENABLE_DEVNET_AGENT_MONEY_MOVEMENT !== 'true') {
    return 'Devnet agent money movement is disabled';
  }
  return null;
}

function getAgentKeypair(): Keypair | null {
  const raw = process.env.DEVNET_AGENT_SECRET_KEY;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

function isAllowedAgentWallet(wallet: string): boolean {
  const allowed = (process.env.DEVNET_AGENT_ALLOWED_WALLETS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return allowed.includes(wallet);
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
    publicKey: keypair.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => {
      if (tx instanceof VersionedTransaction) {
        tx.sign([keypair]);
        return tx;
      }
      tx.partialSign(keypair);
      return tx;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => {
      return Promise.all(txs.map(async tx => {
        if (tx instanceof VersionedTransaction) {
          tx.sign([keypair]);
          return tx;
        }
        tx.partialSign(keypair);
        return tx;
      }));
    },
  };
}

async function loadInvoiceMeta(invoiceId: string, creatorWallet: string) {
  const { data, error } = await supabase
    .from('invoice_meta')
    .select('invoice_id, creator_wallet, client_wallet, token_type, amount')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', creatorWallet)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    invoice_id: string;
    creator_wallet: string;
    client_wallet: string | null;
    token_type: 'USDC' | 'SOL';
    amount: number | string;
  } | null;
}

async function loadAgentVerification(invoiceId: string, creatorWallet: string) {
  const { data, error } = await supabase
    .from('agent_verifications')
    .select('verification_status, recommended_action')
    .eq('invoice_id', invoiceId)
    .eq('creator_wallet', creatorWallet)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    verification_status: 'pending' | 'passed' | 'failed' | 'needs_human_review';
    recommended_action: 'approve' | 'dispute' | 'manual_review';
  } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const gateError = assertDevnetAutomationEnabled();
  if (gateError) return res.status(403).json({ error: gateError });

  const agentKeypair = getAgentKeypair();
  if (!agentKeypair) return res.status(500).json({ error: 'DEVNET_AGENT_SECRET_KEY is missing or invalid' });

  const agentWallet = agentKeypair.publicKey.toBase58();
  if (!isAllowedAgentWallet(agentWallet)) {
    return res.status(403).json({ error: 'Devnet agent wallet is not allowlisted' });
  }

  const {
    action,
    invoiceId,
    creatorWallet,
    tokenType,
    amount,
  } = req.body as {
    action?: DevnetAgentAction;
    invoiceId?: string;
    creatorWallet?: string;
    tokenType?: 'USDC' | 'SOL';
    amount?: number;
  };

  if (!action || !ACTIONS.includes(action)) return res.status(400).json({ error: 'Invalid action' });
  if (!invoiceId || !creatorWallet) return res.status(400).json({ error: 'Missing required fields' });
  if (!isValidSolanaAddress(creatorWallet)) return res.status(400).json({ error: 'Invalid creator wallet' });

  const normalizedCreatorWallet = normalizeSolanaAddress(creatorWallet);
  const invoiceMeta = await loadInvoiceMeta(invoiceId, normalizedCreatorWallet);
  if (!invoiceMeta) return res.status(404).json({ error: 'Invoice metadata not found' });

  const invoiceAmount = Number(invoiceMeta.amount);
  const requestedAmount = Number(amount ?? invoiceAmount);
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (requestedAmount > getMaxAmountUsd()) {
    return res.status(403).json({ error: 'Devnet agent amount cap exceeded' });
  }

  const verification = await loadAgentVerification(invoiceId, normalizedCreatorWallet);
  if (action === 'request_release' && verification?.verification_status !== 'passed') {
    return res.status(409).json({ error: 'Agent release request requires passed verification' });
  }
  if (action === 'approve_release' && verification?.recommended_action !== 'approve') {
    return res.status(409).json({ error: 'Agent approval requires recommended_action approve' });
  }
  if (action === 'raise_dispute' && verification?.recommended_action !== 'dispute') {
    return res.status(409).json({ error: 'Agent dispute requires recommended_action dispute' });
  }

  if (action === 'request_release' && agentWallet !== invoiceMeta.creator_wallet) {
    return res.status(403).json({ error: 'Agent wallet must be the invoice creator to request release' });
  }
  if ((action === 'approve_release' || action === 'raise_dispute') && agentWallet !== invoiceMeta.client_wallet) {
    return res.status(403).json({ error: 'Agent wallet must be the paying client to approve or dispute' });
  }

  const connection = new Connection(process.env.VITE_SOLANA_RPC_URL || process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');
  const provider = new AnchorProvider(connection, createWallet(agentKeypair), { commitment: 'confirmed' });
  const sdk = new EscrowPaySDK(provider, false);
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

  if (!result.success) {
    return res.status(500).json({ error: result.error || 'Devnet agent action failed' });
  }

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

  return res.status(200).json({
    success: true,
    mode: 'Truvlo devnet demo automation',
    action,
    agent_wallet: agentWallet,
    signature: result.data?.signature,
  });
}
