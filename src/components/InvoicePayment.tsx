import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Connection, Transaction, VersionedTransaction } from '@solana/web3.js';
import {
  Loader2, AlertCircle, Check, ArrowLeft, Shield,
  ExternalLink, Plus, Trash2, Wallet
} from 'lucide-react';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType, PLATFORM_FEE_BPS, PLATFORM_FLAT_FEE_USD, PLATFORM_FEE_THRESHOLD_USD } from '@/lib/escrowPaySDK';
import { useToast } from '@/hooks/use-toast';

type PageState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'invoice_loaded'; invoice: InvoiceData }
  | { type: 'payment_success'; invoice: InvoiceData; paidAmount: number; txSignature: string };

interface Installment {
  percentage: number;
}

const cardStyle: React.CSSProperties = {
  maxWidth: '440px',
  margin: '0 auto',
  backgroundColor: '#161B22',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  overflow: 'hidden',
};

const InvoicePayment: React.FC = () => {
  const { invoiceId, creator } = useParams<{ invoiceId: string; creator: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { authenticated, login, getAccessToken } = usePrivy();
  const { activeWallet: privyWallet } = useActiveWallet();
  const publicKey = privyWallet?.address ? new PublicKey(privyWallet.address) : null;
  const connected = authenticated && !!publicKey;
  const { toast } = useToast();

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [paying, setPaying] = useState(false);
  const [sdkInitError, setSdkInitError] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([{ percentage: 100 }]);
  const [solPriceUsd, setSolPriceUsd] = useState<number | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const urlParams = useMemo(() => {
    if (!invoiceId || !creator) return { valid: false, error: 'Invalid invoice link - missing parameters' };
    try {
      new PublicKey(creator);
      return { valid: true, invoiceId, creator };
    } catch {
      return { valid: false, error: 'Invalid invoice link - invalid creator address' };
    }
  }, [invoiceId, creator]);

  const sdk = useMemo(() => {
    if (!publicKey || !privyWallet) return null;
    try {
      const anchorWallet = {
        publicKey,
        signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
          const bytes = tx instanceof VersionedTransaction
            ? tx.serialize()
            : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
          const { signedTransaction } = await privyWallet.signTransaction({ transaction: bytes });
          return (tx instanceof VersionedTransaction
            ? VersionedTransaction.deserialize(signedTransaction)
            : Transaction.from(Buffer.from(signedTransaction))) as T;
        },
        signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
          return Promise.all(txs.map(async (tx) => {
            const bytes = tx instanceof VersionedTransaction
              ? tx.serialize()
              : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
            const { signedTransaction } = await privyWallet.signTransaction({ transaction: bytes });
            return (tx instanceof VersionedTransaction
              ? VersionedTransaction.deserialize(signedTransaction)
              : Transaction.from(Buffer.from(signedTransaction))) as T;
          }));
        },
      };
      const provider = new AnchorProvider(connection, anchorWallet as any, { commitment: 'confirmed' });
      return new EscrowPaySDK(provider);
    } catch { return null; }
  }, [connection, publicKey, privyWallet]);

  const createReadOnlySdk = (conn: Connection): EscrowPaySDK | null => {
    try {
      const mockWallet = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      };
      const provider = new AnchorProvider(conn, mockWallet as any, { commitment: 'confirmed' });
      const instance = new EscrowPaySDK(provider);
      if (!instance.isInitialized()) { setSdkInitError(instance.getInitError()); return null; }
      return instance;
    } catch (e) {
      setSdkInitError(e instanceof Error ? e.message : 'Unknown error');
      return null;
    }
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!urlParams.valid) { setPageState({ type: 'error', message: urlParams.error || 'Invalid link' }); return; }
      const readOnlySdk = createReadOnlySdk(connection);
      if (!readOnlySdk) { setPageState({ type: 'error', message: sdkInitError || 'Failed to initialize.' }); return; }
      try {
        const creatorPubkey = new PublicKey(urlParams.creator!);
        const [result, price] = await Promise.all([
          readOnlySdk.fetchInvoice(urlParams.invoiceId!, creatorPubkey),
          readOnlySdk.getSolPriceUsd(),
        ]);
        if (price) setSolPriceUsd(price);
        if (result.success && result.data) {
          setPageState({ type: 'invoice_loaded', invoice: result.data });
        } else {
          setPageState({ type: 'error', message: result.error || 'Invoice not found' });
        }
      } catch (err) {
        setPageState({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load invoice' });
      }
    };
    fetchInvoice();
  }, [connection, urlParams.valid, urlParams.invoiceId, urlParams.creator]);

  const getDecimals = (t: TokenType) => t === TokenType.USDC ? 6 : 9;

  const fromSmallestUnit = (amount: any, tokenType: TokenType) => {
    const decimals = getDecimals(tokenType);
    try {
      const val = amount?.toNumber ? amount.toNumber() : Number(amount || 0);
      return parseFloat((val / Math.pow(10, decimals)).toFixed(decimals));
    } catch { return 0; }
  };

  const getRemainingAmount = (inv: InvoiceData) => {
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    return parseFloat(Math.max(0, total - paid).toFixed(getDecimals(inv.tokenType)));
  };

  const formatAmount = (value: number, tokenType: TokenType) => {
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    const decimals = tokenType === TokenType.USDC ? 2 : 4;
    return `${parseFloat(value.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals })} ${symbol}`;
  };

  const calculateBreakdown = (inv: InvoiceData) => {
    const amount = getRemainingAmount(inv);
    const dec = getDecimals(inv.tokenType);
    let fee: number;
    let feeLabel: string;

    if (inv.tokenType === TokenType.USDC) {
      if (amount < PLATFORM_FEE_THRESHOLD_USD) {
        fee = PLATFORM_FLAT_FEE_USD;
        feeLabel = `Platform Fee ($${PLATFORM_FLAT_FEE_USD} flat)`;
      } else {
        fee = parseFloat((amount * (PLATFORM_FEE_BPS / 10000)).toFixed(dec));
        feeLabel = `Platform Fee (${PLATFORM_FEE_BPS / 100}%)`;
      }
    } else {
      const valueUsd = solPriceUsd && solPriceUsd > 0 ? amount * solPriceUsd : null;
      if (valueUsd !== null && valueUsd < PLATFORM_FEE_THRESHOLD_USD) {
        fee = parseFloat((PLATFORM_FLAT_FEE_USD / solPriceUsd!).toFixed(dec));
        feeLabel = `Platform Fee ($${PLATFORM_FLAT_FEE_USD} flat)`;
      } else {
        fee = parseFloat((amount * (PLATFORM_FEE_BPS / 10000)).toFixed(dec));
        feeLabel = `Platform Fee (${PLATFORM_FEE_BPS / 100}%)`;
      }
    }

    const total = parseFloat((amount + fee).toFixed(dec));
    return { amount, fee, total, feeLabel };
  };

  const totalPercentage = installments.reduce((sum, i) => sum + (i.percentage || 0), 0);

  const addInstallment = () => {
    if (installments.length >= 10) return;
    setInstallments([...installments, { percentage: 0 }]);
  };

  const removeInstallment = (idx: number) => {
    if (installments.length <= 1) return;
    setInstallments(installments.filter((_, i) => i !== idx));
  };

  const updateInstallment = (idx: number, value: number) => {
    const updated = [...installments];
    updated[idx] = { percentage: Math.min(100, Math.max(0, value)) };
    setInstallments(updated);
  };

  const validateSchedule = (): boolean => {
    if (totalPercentage !== 100) {
      setScheduleError(`Percentages must sum to 100%. Currently: ${totalPercentage}%`);
      return false;
    }
    if (installments.some(i => i.percentage <= 0)) {
      setScheduleError('Each installment must be greater than 0%');
      return false;
    }
    setScheduleError(null);
    return true;
  };

  const handlePay = async () => {
    if (pageState.type !== 'invoice_loaded') return;
    const invoice = pageState.invoice;
    if (!sdk || !connected || !publicKey || !creator) { toast({ title: 'Wallet not connected', variant: 'destructive' }); return; }
    if (!sdk.isInitialized()) { toast({ title: 'SDK not ready', variant: 'destructive' }); return; }
    if (!validateSchedule()) return;

    const breakdown = calculateBreakdown(invoice);
    if (breakdown.amount <= 0) { toast({ title: 'Invalid amount', variant: 'destructive' }); return; }

    setPaying(true);
    try {
      const creatorPubkey = new PublicKey(creator);
      const payResult = await sdk.payInvoice(invoice.invoiceId, creatorPubkey, breakdown.amount, invoice.tokenType);
      if (!payResult.success) {
        toast({ title: 'Payment failed', description: typeof payResult.error === 'string' ? payResult.error : 'Payment failed', variant: 'destructive' });
        return;
      }
      const scheduleBps = installments.map(i => Math.round(i.percentage * 100));
      const scheduleResult = await sdk.setReleaseSchedule(invoice.invoiceId, creatorPubkey, scheduleBps);
      if (!scheduleResult.success) {
        toast({ title: 'Schedule not set', description: 'Payment succeeded but release schedule failed. Creator can release freely.', variant: 'destructive' });
      }
      const updated = await sdk.fetchInvoice(invoice.invoiceId, creatorPubkey);
      setPageState({
        type: 'payment_success',
        invoice: updated.success && updated.data ? updated.data : invoice,
        paidAmount: breakdown.amount,
        txSignature: payResult.data?.signature || '',
      });
      const token = await getAccessToken();
      fetch('/api/notify-creator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoiceId: invoice.invoiceId,
          creatorWallet: creator,
          clientWallet: publicKey.toBase58() ?? '',
          event: 'paid',
          amount: formatAmount(breakdown.amount, invoice.tokenType),
        }),
      }).catch(() => {});
    } catch (error: unknown) {
      let msg = 'Transaction failed.';
      const errorStr = error instanceof Error ? error.message : String(error || '');
      if (errorStr.includes('User rejected') || errorStr.includes('rejected the request')) msg = 'Transaction cancelled.';
      else if (errorStr.toLowerCase().includes('insufficient')) msg = 'Insufficient balance.';
      toast({ title: 'Payment failed', description: msg, variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  // ── LOADING ─────────────────────────────────────────────────────
  if (pageState.type === 'loading') {
    return (
      <div style={cardStyle}>
        <div className="p-12 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#2DD4BF' }} />
          <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>Loading invoice...</p>
          {sdkInitError && <p style={{ color: '#EF4444', fontFamily: '"DM Sans", sans-serif', fontSize: '12px' }}>{sdkInitError}</p>}
        </div>
      </div>
    );
  }

  // ── ERROR ────────────────────────────────────────────────────────
  if (pageState.type === 'error') {
    return (
      <div style={cardStyle}>
        <div className="p-10 flex flex-col items-center gap-4 text-center">
          <AlertCircle className="h-10 w-10" style={{ color: '#EF4444' }} />
          <div>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1.125rem', color: '#F8FAFC', marginBottom: '8px' }}>
              Invoice Not Found
            </h3>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '6px' }}>
              {pageState.message}
            </p>
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '11px', color: '#64748B', marginBottom: '24px' }}>
              ID: {invoiceId || 'N/A'}
            </p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              cursor: 'pointer',
            }}
          >
            <ArrowLeft className="h-4 w-4" />Go Home
          </button>
        </div>
      </div>
    );
  }

  // ── SUCCESS ──────────────────────────────────────────────────────
  if (pageState.type === 'payment_success') {
    const { invoice, paidAmount, txSignature } = pageState;
    return (
      <div style={cardStyle}>
        <div className="p-10 flex flex-col items-center gap-4 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}
          >
            <Check className="h-8 w-8" style={{ color: '#22C55E' }} />
          </div>

          <div>
            <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#F8FAFC', letterSpacing: '-0.01em', marginBottom: '8px' }}>
              Funds Secured
            </h2>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '24px' }}>
              <span style={{ color: '#F8FAFC', fontWeight: 500 }}>{formatAmount(paidAmount, invoice.tokenType)}</span> deposited into escrow.
            </p>
          </div>

          <div className="w-full rounded-lg p-4 text-left space-y-2.5" style={{ backgroundColor: '#1C2128' }}>
            {[
              { label: 'Amount paid', value: formatAmount(paidAmount, invoice.tokenType) },
              { label: 'Installments', value: String(installments.length) },
              { label: 'Status', value: 'In escrow', highlight: true },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between text-sm">
                <span style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>{label}</span>
                <span style={{ color: highlight ? '#4ADE80' : '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontWeight: highlight ? 500 : 400 }}>{value}</span>
              </div>
            ))}
          </div>

          {installments.length > 1 && (
            <div className="w-full rounded-lg p-4 text-left" style={{ backgroundColor: '#1C2128' }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', fontWeight: 500, color: '#F8FAFC', marginBottom: '8px' }}>Release schedule</p>
              {installments.map((inst, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '12px' }}>Installment {i + 1}</span>
                  <span style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '12px' }}>
                    {inst.percentage}% — {formatAmount(paidAmount * inst.percentage / 100, invoice.tokenType)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div
            className="w-full rounded-lg p-4 flex items-start gap-3 text-left"
            style={{ backgroundColor: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}
          >
            <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#38BDF8' }} />
            <p style={{ color: '#7DD3FC', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.5 }}>
              Funds are secured on-chain. The creator can only release according to the schedule you set.
            </p>
          </div>

          {txSignature && (
            <a
              href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs transition-opacity duration-150 hover:opacity-70"
              style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
            >
              View on Solana Explorer <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <button
            onClick={() => navigate('/')}
            className="w-full rounded-lg py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: '#2DD4BF',
              color: '#0D1117',
              fontFamily: '"DM Sans", sans-serif',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // ── INVOICE LOADED ───────────────────────────────────────────────
  const invoice = pageState.invoice;
  const totalAmount = fromSmallestUnit(invoice.amount, invoice.tokenType);
  const paidAmount = fromSmallestUnit(invoice.amountPaid, invoice.tokenType);
  const remaining = getRemainingAmount(invoice);
  const progressPercent = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
  const breakdown = calculateBreakdown(invoice);
  const isPaid = invoice.status === InvoiceStatus.FullyPaid || invoice.status === InvoiceStatus.Released;
  const isPartiallyPaid = invoice.status === InvoiceStatus.PartiallyPaid;
  const symbol = invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL';

  const statusBadge = {
    [InvoiceStatus.Unpaid]: { label: 'Pending', bg: 'rgba(249,115,22,0.1)', color: '#FB923C' },
    [InvoiceStatus.PartiallyPaid]: { label: 'Partial', bg: 'rgba(59,130,246,0.1)', color: '#93C5FD' },
    [InvoiceStatus.FullyPaid]: { label: 'In Escrow', bg: 'rgba(59,130,246,0.1)', color: '#93C5FD' },
    [InvoiceStatus.Released]: { label: 'Released', bg: 'rgba(34,197,94,0.1)', color: '#4ADE80' },
    [InvoiceStatus.Disputed]: { label: 'Disputed', bg: 'rgba(245,158,11,0.1)', color: '#FCD34D' },
  }[invoice.status] ?? { label: 'Unknown', bg: 'rgba(255,255,255,0.06)', color: '#94A3B8' };

  return (
    <div style={cardStyle}>
      {/* Invoice header */}
      <div className="p-7 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-5">
          <span
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '12px',
              color: '#94A3B8',
            }}
          >
            {invoice.invoiceId}
          </span>
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{ backgroundColor: statusBadge.bg, color: statusBadge.color, fontFamily: '"DM Sans", sans-serif' }}
          >
            {statusBadge.label}
          </span>
        </div>

        <p
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '3rem',
            color: '#F8FAFC',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            marginBottom: '8px',
          }}
        >
          {parseFloat(totalAmount.toFixed(invoice.tokenType === TokenType.USDC ? 2 : 4)).toLocaleString('en-US', {
            maximumFractionDigits: invoice.tokenType === TokenType.USDC ? 2 : 4,
          })}
          <span style={{ fontSize: '1.125rem', color: '#64748B', marginLeft: '8px', fontWeight: 500 }}>{symbol}</span>
        </p>

        {(isPartiallyPaid || isPaid) && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
              <span>Paid: {formatAmount(paidAmount, invoice.tokenType)}</span>
              <span>{progressPercent.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPercent}%`,
                  backgroundColor: invoice.status === InvoiceStatus.Released ? '#22C55E' : '#3B82F6',
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-4">
          <span
            className="px-2.5 py-0.5 rounded-full text-xs font-medium"
            style={{
              backgroundColor: invoice.tokenType === TokenType.USDC ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)',
              color: invoice.tokenType === TokenType.USDC ? '#4ADE80' : '#7DD3FC',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            {invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-4">
        {/* Creator */}
        <div>
          <div className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128' }}>
            <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px' }}>From</p>
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#F8FAFC' }}>
              {creator ? `${creator.slice(0, 6)}...${creator.slice(-6)}` : 'Unknown'}
            </p>
          </div>
        </div>

        {/* Pay section — only if not yet fully paid */}
        {!isPaid && remaining > 0 && (
          <>
            <div
              className="rounded-lg p-3.5 flex items-start gap-3"
              style={{ backgroundColor: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}
            >
              <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#38BDF8' }} />
              <p style={{ color: '#7DD3FC', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.5 }}>
                Your payment is held securely in a smart contract. You decide how funds are released to the creator.
              </p>
            </div>

            {/* Release schedule builder */}
            <div
              className="rounded-lg p-4"
              style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', fontWeight: 500, color: '#F8FAFC' }}>Release schedule</p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: '#64748B', marginTop: '2px' }}>How should funds be released to the creator?</p>
                </div>
                <button
                  type="button"
                  onClick={addInstallment}
                  disabled={installments.length >= 10}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity duration-150 hover:opacity-80 disabled:opacity-40"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#94A3B8',
                    fontFamily: '"DM Sans", sans-serif',
                    cursor: installments.length >= 10 ? 'default' : 'pointer',
                  }}
                >
                  <Plus className="h-3 w-3" />Add
                </button>
              </div>

              <div className="space-y-2 mb-3">
                {installments.map((inst, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#64748B', width: '80px', flexShrink: 0 }}>
                      Installment {idx + 1}
                    </span>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        value={inst.percentage || ''}
                        onChange={(e) => updateInstallment(idx, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        min="1"
                        max="100"
                        style={{
                          width: '100%',
                          backgroundColor: '#1C2128',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          color: '#F8FAFC',
                          fontFamily: '"DM Sans", sans-serif',
                          fontSize: '13px',
                          padding: '6px 28px 6px 10px',
                          height: '34px',
                          outline: 'none',
                        }}
                      />
                      <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#64748B', fontSize: '12px' }}>%</span>
                    </div>
                    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: '#64748B', width: '88px', textAlign: 'right', flexShrink: 0 }}>
                      {inst.percentage > 0 ? formatAmount(breakdown.amount * inst.percentage / 100, invoice.tokenType) : '—'}
                    </span>
                    {installments.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInstallment(idx)}
                        className="flex-shrink-0 transition-opacity duration-150 hover:opacity-60"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div
                className="flex justify-between text-xs font-medium pt-2 border-t"
                style={{
                  borderColor: 'rgba(255,255,255,0.06)',
                  color: totalPercentage === 100 ? '#4ADE80' : '#EF4444',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                <span>Total</span>
                <span>{totalPercentage}% {totalPercentage === 100 ? '✓' : `(need ${100 - totalPercentage > 0 ? '+' : ''}${100 - totalPercentage}%)`}</span>
              </div>
              {scheduleError && (
                <p style={{ color: '#EF4444', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', marginTop: '8px' }}>{scheduleError}</p>
              )}
            </div>

            {/* Payment breakdown */}
            <div>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', fontWeight: 500, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                Payment Amount
              </p>
              <div className="rounded-lg p-4 space-y-2.5" style={{ backgroundColor: '#1C2128' }}>
                {[
                  { label: 'Amount', value: formatAmount(breakdown.amount, invoice.tokenType) },
                  { label: breakdown.feeLabel, value: formatAmount(breakdown.fee, invoice.tokenType) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>{label}</span>
                    <span style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif' }}>{value}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-medium pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <span style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif' }}>Total</span>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, color: '#F8FAFC' }}>{formatAmount(breakdown.total, invoice.tokenType)}</span>
                </div>
              </div>
            </div>

            {/* Pay button / wallet connect */}
            <div className="pt-1">
              {!connected ? (
                <div className="space-y-3">
                  <div
                    className="flex items-center justify-center gap-2 rounded-lg p-3.5"
                    style={{ backgroundColor: '#1C2128' }}
                  >
                    <Wallet className="h-4 w-4" style={{ color: '#64748B' }} />
                    <span style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
                      Connect to continue
                    </span>
                  </div>
                  <button
                    onClick={() => login()}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#2DD4BF',
                      color: '#0D1117',
                      border: 'none',
                      borderRadius: '8px',
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Connect Wallet
                  </button>
                </div>
              ) : (
                <button
                  onClick={handlePay}
                  disabled={paying || breakdown.amount <= 0 || totalPercentage !== 100}
                  className="w-full flex items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: '#2DD4BF',
                    color: '#0D1117',
                    fontFamily: '"DM Sans", sans-serif',
                    border: 'none',
                    cursor: paying ? 'default' : 'pointer',
                  }}
                >
                  {paying
                    ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</>
                    : `Lock Funds — ${formatAmount(breakdown.total, invoice.tokenType)}`}
                </button>
              )}
            </div>
          </>
        )}

        {/* Already paid state */}
        {isPaid && (
          <div className="py-6 text-center">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
              style={{ backgroundColor: 'rgba(34,197,94,0.1)' }}
            >
              <Check className="h-6 w-6" style={{ color: '#22C55E' }} />
            </div>
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1.125rem', color: '#F8FAFC', marginBottom: '6px' }}>
              {invoice.status === InvoiceStatus.Released ? 'Payment Complete' : 'Funds Secured'}
            </h3>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', lineHeight: 1.5 }}>
              {invoice.status === InvoiceStatus.Released
                ? 'Funds have been released to the creator.'
                : 'This invoice has been fully paid. Awaiting release.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoicePayment;
