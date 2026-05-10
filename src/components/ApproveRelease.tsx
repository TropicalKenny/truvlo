import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import { Loader2, AlertCircle, Check, AlertTriangle, Clock, Bot } from 'lucide-react';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType } from '@/lib/escrowPaySDK';
import { createPrivySolanaAnchorWallet } from '@/lib/privySolanaAnchorWallet';
import { sendSponsoredSolanaTransaction } from '@/lib/privySponsoredSolana';
import { formatTokenAmountValue } from '@/lib/amountFormat';
import { useToast } from '@/hooks/use-toast';

type PageState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'loaded'; invoice: InvoiceData }
  | { type: 'approved' }
  | { type: 'disputed' };

type AgentVerification = {
  verification_status: 'pending' | 'passed' | 'failed' | 'needs_human_review';
  confidence: 'low' | 'medium' | 'high';
  summary: string | null;
  risks: string | null;
  recommended_action: 'approve' | 'dispute' | 'manual_review';
  verifier_type: 'rule' | 'ai' | 'manual';
};

type AgentPolicy = {
  status: 'active' | 'disabled' | 'expired';
  agent_wallet: string;
  max_amount: number | string;
  token_type: 'USDC' | 'SOL';
  can_approve_release: boolean;
  can_raise_dispute?: boolean;
  approval_rule: 'verification_passed_and_recommended_approve';
  expires_at: string;
};

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Auto-releasing soon';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

const cardStyle: React.CSSProperties = {
  maxWidth: '440px',
  margin: '0 auto',
  backgroundColor: 'var(--tl-surface)',
  border: '1px solid var(--tl-border)',
  borderRadius: '8px',
  padding: '40px 32px',
};

const shortWallet = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`;

const ApproveRelease: React.FC = () => {
  const { invoiceId, creator } = useParams<{ invoiceId: string; creator: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { authenticated, login, getAccessToken } = usePrivy();
  const { activeWallet: privyWallet } = useActiveWallet();
  const publicKey = useMemo(
    () => (privyWallet?.address ? new PublicKey(privyWallet.address) : null),
    [privyWallet?.address],
  );
  const connected = authenticated && !!publicKey;
  const { toast } = useToast();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [sdkInitError, setSdkInitError] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [agentVerification, setAgentVerification] = useState<AgentVerification | null>(null);
  const [agentPolicy, setAgentPolicy] = useState<AgentPolicy | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => clearInterval(interval);
  }, []);

  const urlValid = useMemo(() => {
    if (!invoiceId || !creator) return false;
    try { new PublicKey(creator); return true; } catch { return false; }
  }, [invoiceId, creator]);

  const sdk = useMemo(() => {
    if (!publicKey || !privyWallet) return null;
    try {
      const anchorWallet = createPrivySolanaAnchorWallet(privyWallet, publicKey);
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
      const sponsorFn = async (tx: Uint8Array): Promise<string> => {
        return sendSponsoredSolanaTransaction(signAndSendTransaction, privyWallet, tx);
      };
      return new EscrowPaySDK(provider, false, sponsorFn);
    } catch { return null; }
  }, [connection, publicKey, privyWallet, signAndSendTransaction]);

  const createReadOnlySdk = useCallback((conn: Connection): EscrowPaySDK | null => {
    try {
      const mock: Wallet = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
      };
      const provider = new AnchorProvider(conn, mock, { commitment: 'confirmed' });
      const instance = new EscrowPaySDK(provider);
      if (!instance.isInitialized()) { setSdkInitError(instance.getInitError()); return null; }
      return instance;
    } catch { return null; }
  }, []);

  const fetchInvoice = useCallback(async () => {
    if (!urlValid) { setPageState({ type: 'error', message: 'Invalid link — missing invoice ID or creator address.' }); return; }
    const readOnly = createReadOnlySdk(connection);
    if (!readOnly) { setPageState({ type: 'error', message: sdkInitError || 'Failed to initialize. Please refresh.' }); return; }
    try {
      const result = await readOnly.fetchInvoice(invoiceId!, new PublicKey(creator!));
      if (result.success && result.data) {
        setPageState({ type: 'loaded', invoice: result.data });
      } else {
        setPageState({ type: 'error', message: result.error || 'Invoice not found.' });
      }
    } catch (e) {
      setPageState({ type: 'error', message: e instanceof Error ? e.message : 'Failed to load invoice.' });
    }
  }, [connection, createReadOnlySdk, creator, invoiceId, sdkInitError, urlValid]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  useEffect(() => {
    if (!urlValid || !invoiceId || !creator) return;
    const params = new URLSearchParams({ invoiceId, creatorWallet: creator });
    const verificationParams = new URLSearchParams(params);
    verificationParams.set('agentEndpoint', 'agent-verifications');
    const policyParams = new URLSearchParams(params);
    policyParams.set('agentEndpoint', 'agent-policies');
    Promise.all([
      fetch(`/api/create-invoice-meta?${verificationParams.toString()}`).then(res => (res.ok ? res.json() : null)).catch(() => null),
      fetch(`/api/create-invoice-meta?${policyParams.toString()}`).then(res => (res.ok ? res.json() : null)).catch(() => null),
    ]).then(([verificationData, policyData]: [
      { agent_verification?: AgentVerification | null } | null,
      { agent_policy?: AgentPolicy | null } | null,
    ]) => {
      setAgentVerification(verificationData?.agent_verification ?? null);
      setAgentPolicy(policyData?.agent_policy ?? null);
    }).catch(() => {
      setAgentVerification(null);
      setAgentPolicy(null);
    });
  }, [urlValid, invoiceId, creator]);

  const fromSmallestUnit = (amount: unknown, tokenType: TokenType) => {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      const raw = amount && typeof amount === 'object' && 'toNumber' in amount && typeof amount.toNumber === 'function'
        ? amount.toNumber()
        : Number(amount ?? 0);
      const int = BigInt(Math.round(raw));
      const divisor = BigInt(10 ** decimals);
      const whole = int / divisor;
      const remainder = int % divisor;
      return parseFloat(`${whole}.${remainder.toString().padStart(decimals, '0')}`);
    } catch { return 0; }
  };

  const getSecondsRemaining = (inv: InvoiceData) => {
    if (!inv.completionRequestedAt) return -1;
    const req = inv.completionRequestedAt.toNumber
      ? inv.completionRequestedAt.toNumber()
      : Number(inv.completionRequestedAt);
    return Math.max(0, 7 * 24 * 60 * 60 - (now - req));
  };

  const isConnectedWalletInvoiceClient = (invoice: InvoiceData) =>
    !!connected && !!publicKey && !!invoice.client && invoice.client.toBase58() === publicKey.toBase58();

  const isAgentPolicyClient = (invoice: InvoiceData) =>
    authenticated
    && agentPolicy?.status === 'active'
    && !!invoice.client
    && invoice.client.toBase58() === agentPolicy.agent_wallet;

  const handleAgentPolicyAction = async (action: 'approve_release' | 'raise_dispute') => {
    if (pageState.type !== 'loaded') return;
    if (!authenticated) {
      await login();
      return;
    }
    if (!isAgentPolicyClient(pageState.invoice)) {
      toast({ title: 'Truvlo Agent policy not available', variant: 'destructive' });
      return;
    }

    if (action === 'approve_release') setApproving(true);
    else setDisputing(true);

    try {
      const token = await getAccessToken();
      const response = await fetch('/api/devnet-agent-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          invoiceId,
          creatorWallet: creator,
          tokenType: pageState.invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL',
          amount: fromSmallestUnit(pageState.invoice.amountPaid || pageState.invoice.amount, pageState.invoice.tokenType),
          clientCommanded: true,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      if (action === 'approve_release') {
        setPageState({ type: 'approved' });
        fetch('/api/notify-creator', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ invoiceId, creatorWallet: creator, clientWallet: agentPolicy?.agent_wallet ?? '', event: 'release_approved' }),
        }).catch(() => {});
      } else {
        setPageState({ type: 'disputed' });
        await fetch('/api/disputes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'open',
            invoiceId,
            openedByWallet: agentPolicy?.agent_wallet ?? '',
          }),
        }).catch(error => console.error('Dispute case recording failed:', error));
        navigate(`/disputes/${encodeURIComponent(invoiceId ?? '')}/${encodeURIComponent(creator ?? '')}/evidence`);
        fetch('/api/notify-creator', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ invoiceId, creatorWallet: creator, clientWallet: agentPolicy?.agent_wallet ?? '', event: 'disputed' }),
        }).catch(() => {});
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Agent action failed.';
      toast({
        title: action === 'approve_release' ? 'Agent approval failed' : 'Agent dispute failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      if (action === 'approve_release') setApproving(false);
      else setDisputing(false);
    }
  };

  const handleApprove = async () => {
    if (pageState.type !== 'loaded') return;
    if (isAgentPolicyClient(pageState.invoice)) {
      await handleAgentPolicyAction('approve_release');
      return;
    }
    if (!isConnectedWalletInvoiceClient(pageState.invoice)) {
      toast({ title: 'Connect the wallet you paid with', variant: 'destructive' });
      return;
    }
    if (!sdk) { toast({ title: 'Wallet not ready', variant: 'destructive' }); return; }
    setApproving(true);
    try {
      const result = await sdk.approveRelease(invoiceId!, new PublicKey(creator!));
      if (result.success) {
        setPageState({ type: 'approved' });
        const token = await getAccessToken();
        fetch('/api/notify-creator', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ invoiceId, creatorWallet: creator, clientWallet: publicKey?.toBase58() ?? '', event: 'release_approved' }),
        }).catch(() => {});
      } else {
        toast({ title: 'Approval failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.';
      toast({ title: 'Approval failed', description: msg, variant: 'destructive' });
    } finally { setApproving(false); }
  };

  const handleDispute = async () => {
    if (pageState.type !== 'loaded') return;
    if (isAgentPolicyClient(pageState.invoice)) {
      await handleAgentPolicyAction('raise_dispute');
      return;
    }
    if (!isConnectedWalletInvoiceClient(pageState.invoice)) {
      toast({ title: 'Connect the wallet you paid with', variant: 'destructive' });
      return;
    }
    if (!sdk) { toast({ title: 'Wallet not ready', variant: 'destructive' }); return; }
    setDisputing(true);
    try {
      const result = await sdk.raiseDispute(invoiceId!, new PublicKey(creator!));
      if (result.success) {
        setPageState({ type: 'disputed' });
        const token = await getAccessToken();
        await fetch('/api/disputes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'open',
            invoiceId,
            openedByWallet: publicKey?.toBase58() ?? '',
          }),
        }).catch(error => console.error('Dispute case recording failed:', error));
        navigate(`/disputes/${encodeURIComponent(invoiceId ?? '')}/${encodeURIComponent(creator ?? '')}/evidence`);
        fetch('/api/notify-creator', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ invoiceId, creatorWallet: creator, clientWallet: publicKey?.toBase58() ?? '', event: 'disputed' }),
        }).catch(() => {});
      } else {
        toast({ title: 'Dispute failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.';
      toast({ title: 'Dispute failed', description: msg, variant: 'destructive' });
    } finally { setDisputing(false); }
  };

  // ── LOADING ─────────────────────────────────────────────────────
  if (pageState.type === 'loading') {
    return (
      <div style={cardStyle}>
        <div className="flex flex-col items-center gap-4 py-8">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: 'var(--tl-brand)' }} />
          <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
            Loading invoice...
          </p>
        </div>
      </div>
    );
  }

  // ── ERROR ────────────────────────────────────────────────────────
  if (pageState.type === 'error') {
    return (
      <div style={cardStyle}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <AlertCircle className="h-10 w-10" style={{ color: '#EF4444' }} />
          <div>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1.125rem', color: '#F8FAFC', marginBottom: '8px' }}>
              Something went wrong
            </h3>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '24px' }}>
              {pageState.message}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              cursor: 'pointer',
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // ── APPROVED ─────────────────────────────────────────────────────
  if (pageState.type === 'approved') {
    return (
      <div style={cardStyle}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}
          >
            <Check className="h-8 w-8" style={{ color: '#22C55E' }} />
          </div>
          <div>
            <h2
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: '1.5rem',
                color: '#F8FAFC',
                letterSpacing: '-0.01em',
                marginBottom: '10px',
              }}
            >
              Withdrawal approved
            </h2>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', lineHeight: 1.6, marginBottom: '28px' }}>
              The creator can now withdraw the funds from escrow. Thank you for confirming.
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              cursor: 'pointer',
            }}
          >
            Open Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── DISPUTED ─────────────────────────────────────────────────────
  if (pageState.type === 'disputed') {
    return (
      <div style={cardStyle}>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}
          >
            <AlertTriangle className="h-8 w-8" style={{ color: '#F59E0B' }} />
          </div>
          <div>
            <h2
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: '1.5rem',
                color: '#F8FAFC',
                letterSpacing: '-0.01em',
                marginBottom: '10px',
              }}
            >
              Dispute raised
            </h2>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
              Your funds are now frozen. The platform will review the case and contact both parties.
            </p>
            <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.6, marginBottom: '28px' }}>
              Do not send additional payments until the dispute is resolved.
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              cursor: 'pointer',
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // ── LOADED ───────────────────────────────────────────────────────
  const inv = pageState.invoice;
  const secondsLeft = getSecondsRemaining(inv);
  const isDisputed = inv.status === InvoiceStatus.Disputed;
  const alreadyApproved = inv.clientApproved;
  const amountValue = fromSmallestUnit(inv.amountPaid || inv.amount, inv.tokenType);
  const symbol = inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL';
  const connectedWalletMatchesClient = isConnectedWalletInvoiceClient(inv);
  const canUseAgentPolicy = isAgentPolicyClient(inv);
  const canActAsClient = connectedWalletMatchesClient || canUseAgentPolicy;
  const connectedWrongWallet = connected && !connectedWalletMatchesClient && !canUseAgentPolicy;
  const agentReviewColor = agentVerification?.verification_status === 'passed' ? '#4ADE80'
    : agentVerification?.verification_status === 'failed' ? '#F87171'
    : '#FCD34D';
  const agentReviewLabel = agentVerification?.verification_status === 'passed' ? 'Looks complete'
    : agentVerification?.verification_status === 'failed' ? 'Risk flagged'
    : agentVerification?.verification_status === 'pending' ? 'Agent review pending'
    : 'Needs review';

  return (
    <div style={cardStyle}>
      {/* Invoice amount */}
      <div className="mb-6">
        <p
          className="uppercase tracking-widest mb-2"
          style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', letterSpacing: '0.08em' }}
        >
          Withdrawal amount
        </p>
        <div className="flex items-baseline gap-1">
          <span
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: '3.5rem',
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {formatTokenAmountValue(amountValue, inv.tokenType)}
          </span>
          <span
            style={{
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 500,
              fontSize: '1rem',
              color: '#64748B',
              marginLeft: '4px',
            }}
          >
            {symbol}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="mb-5" style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />

      {/* Invoice details */}
      <div className="space-y-3 mb-5">
        <div>
          <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '3px' }}>Invoice ID</p>
          <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#94A3B8' }}>{invoiceId}</p>
        </div>
      </div>

      {agentVerification && (
        <div
          className="rounded-lg p-3.5 mb-5"
          style={{ backgroundColor: 'rgba(17,24,32,0.9)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" style={{ color: agentReviewColor }} />
              <p style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', fontWeight: 600 }}>
                Agent-assisted review
              </p>
            </div>
            <span className="trust-status" style={{ color: agentReviewColor, backgroundColor: 'rgba(255,255,255,0.06)' }}>
              {agentReviewLabel}
            </span>
          </div>
          {agentVerification.summary && (
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.55 }}>
              {agentVerification.summary}
            </p>
          )}
          {agentVerification.risks && (
            <p className="mt-2" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', lineHeight: 1.5 }}>
              Risk note: {agentVerification.risks}
            </p>
          )}
          <p className="mt-2" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', lineHeight: 1.5 }}>
            This is a recommendation, not an automatic release. Approving or disputing still requires your wallet.
          </p>
        </div>
      )}

      {agentPolicy?.status === 'active' && (
        <div
          className="rounded-lg p-3.5 mb-5"
          style={{ backgroundColor: 'rgba(var(--tl-brand-rgb), 0.08)', border: '1px solid rgba(var(--tl-brand-rgb), 0.2)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Bot className="h-4 w-4" style={{ color: 'var(--tl-brand-bright)' }} />
            <p style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', fontWeight: 600 }}>
              Truvlo Agent is acting for the client
            </p>
          </div>
          <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.55 }}>
            Truvlo Agent paid this invoice for you. You can command the agent signer to approve or dispute from this page; automated approval still requires passed verification.
          </p>
          <p className="mt-2 trust-mono" style={{ color: '#64748B', fontSize: '11px' }}>
            Agent {shortWallet(agentPolicy.agent_wallet)}
          </p>
        </div>
      )}

      {/* Countdown timer */}
      {secondsLeft > 0 && !isDisputed && !alreadyApproved && (
        <div
          className="rounded-lg p-3.5 flex items-center gap-3 mb-5"
          style={{ backgroundColor: 'var(--tl-surface-3)' }}
        >
          <Clock className="h-4 w-4 flex-shrink-0" style={{ color: '#94A3B8' }} />
          <div>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', fontWeight: 500, color: '#F8FAFC' }}>
              {formatCountdown(secondsLeft)}
            </p>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: '#64748B' }}>
              Funds can be withdrawn if you take no action
            </p>
          </div>
        </div>
      )}

      {/* Already approved */}
      {alreadyApproved && (
        <div
          className="rounded-lg p-3.5 flex items-center gap-3 mb-5"
          style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
        >
          <Check className="h-4 w-4 flex-shrink-0" style={{ color: '#22C55E' }} />
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#4ADE80' }}>
            You've already approved this withdrawal
          </p>
        </div>
      )}

      {/* Disputed */}
      {isDisputed && (
        <div
          className="rounded-lg p-3.5 flex items-center gap-3 mb-5"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: '#F59E0B' }} />
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#FCD34D' }}>
            This invoice is disputed — funds are frozen
          </p>
        </div>
      )}

      {/* Action buttons */}
      {!alreadyApproved && !isDisputed && (
        <div className="flex flex-col gap-3">
          {!connected && (
            <div className="space-y-3">
              <div
                className="rounded-lg p-3.5 text-center"
                style={{ backgroundColor: 'var(--tl-surface-3)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', fontWeight: 600 }}>
                  Continue as client to approve or dispute
                </p>
                <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.5, marginTop: '5px' }}>
                  No Truvlo profile setup needed. Use the same wallet that paid this invoice, or log in as the client who enabled Truvlo Agent.
                </p>
              </div>
              <button
                type="button"
                onClick={() => login()}
                className="w-full rounded-lg py-3.5 text-sm font-medium transition-opacity duration-150 hover:opacity-90"
                style={{
                  backgroundColor: 'var(--tl-brand)',
                  color: 'var(--tl-bg-soft)',
                  fontFamily: '"DM Sans", sans-serif',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Continue as client
              </button>
            </div>
          )}

          {connectedWrongWallet && (
            <div
              className="rounded-lg p-3.5"
              style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <p style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', lineHeight: 1.5 }}>
                Connected: {publicKey ? shortWallet(publicKey.toBase58()) : 'unknown'}. This invoice was paid by {inv.client ? shortWallet(inv.client.toBase58()) : 'another wallet'}. Switch to the paying wallet to approve or dispute.
              </p>
            </div>
          )}

          <button
            onClick={handleApprove}
            disabled={approving || disputing || !canActAsClient}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
            style={{
              backgroundColor: 'var(--tl-brand)',
              color: 'var(--tl-bg-soft)',
              fontFamily: '"DM Sans", sans-serif',
              border: 'none',
              cursor: approving || !canActAsClient ? 'default' : 'pointer',
            }}
          >
            {approving
              ? <><Loader2 className="h-4 w-4 animate-spin" />Approving...</>
              : <><Check className="h-4 w-4" />Approve Withdrawal</>}
          </button>

          <button
            onClick={handleDispute}
            disabled={approving || disputing || !canActAsClient}
            className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-all duration-150 hover:opacity-80 disabled:opacity-50"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(245,158,11,0.3)',
              color: '#FCD34D',
              fontFamily: '"DM Sans", sans-serif',
              cursor: disputing || !canActAsClient ? 'default' : 'pointer',
            }}
          >
            {disputing
              ? <><Loader2 className="h-4 w-4 animate-spin" />Raising dispute...</>
              : <><AlertTriangle className="h-4 w-4" />Raise Dispute</>}
          </button>

          <p
            className="text-center"
            style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', lineHeight: 1.5 }}
          >
            Raising a dispute freezes all funds until the platform resolves the case.
          </p>
        </div>
      )}
    </div>
  );
};

export default ApproveRelease;
