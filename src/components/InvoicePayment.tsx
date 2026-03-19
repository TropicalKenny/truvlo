import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import { Loader2, AlertCircle, Check, ArrowLeft, Wallet, Shield, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType, PLATFORM_FEE_BPS } from '@/lib/escrowPaySDK';
import { useToast } from '@/hooks/use-toast';

type PageState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'invoice_loaded'; invoice: InvoiceData }
  | { type: 'payment_success'; invoice: InvoiceData; paidAmount: number; txSignature: string };

interface Installment {
  percentage: number;
}

const InvoicePayment: React.FC = () => {
  const { invoiceId, creator } = useParams<{ invoiceId: string; creator: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { toast } = useToast();

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [paying, setPaying] = useState(false);
  const [sdkInitError, setSdkInitError] = useState<string | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([{ percentage: 100 }]);
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
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    try {
      const provider = new AnchorProvider(connection, { publicKey, signTransaction, signAllTransactions }, { commitment: 'confirmed' });
      return new EscrowPaySDK(provider);
    } catch { return null; }
  }, [connection, publicKey, signTransaction, signAllTransactions]);

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
        const result = await readOnlySdk.fetchInvoice(urlParams.invoiceId!, creatorPubkey);
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
    return `${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol}`;
  };

  const calculateBreakdown = (inv: InvoiceData) => {
    const amount = getRemainingAmount(inv);
    const fee = parseFloat((amount * (PLATFORM_FEE_BPS / 10000)).toFixed(getDecimals(inv.tokenType)));
    const total = parseFloat((amount + fee).toFixed(getDecimals(inv.tokenType)));
    return { amount, fee, total };
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

      // Step 1: Pay full amount
      const payResult = await sdk.payInvoice(invoice.invoiceId, creatorPubkey, breakdown.amount, invoice.tokenType);
      if (!payResult.success) {
        toast({ title: 'Payment failed', description: typeof payResult.error === 'string' ? payResult.error : 'Payment failed', variant: 'destructive' });
        return;
      }

      // Step 2: Set release schedule on-chain (convert % to basis points)
      const scheduleBps = installments.map(i => Math.round(i.percentage * 100));
      const scheduleResult = await sdk.setReleaseSchedule(invoice.invoiceId, creatorPubkey, scheduleBps);
      if (!scheduleResult.success) {
        toast({ title: 'Schedule not set', description: 'Payment succeeded but release schedule failed. Creator can release freely.', variant: 'destructive' });
      }

      // Show success
      const updated = await sdk.fetchInvoice(invoice.invoiceId, creatorPubkey);
      setPageState({
        type: 'payment_success',
        invoice: updated.success && updated.data ? updated.data : invoice,
        paidAmount: breakdown.amount,
        txSignature: payResult.data?.signature || '',
      });
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

  // ==================== RENDER ====================

  if (pageState.type === 'loading') {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 flex flex-col items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading invoice...</p>
          {sdkInitError && <p className="text-xs text-destructive mt-2">{sdkInitError}</p>}
        </CardContent>
      </Card>
    );
  }

  if (pageState.type === 'error') {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Invoice Not Found</h3>
          <p className="text-sm text-muted-foreground mb-4">{pageState.message}</p>
          <p className="text-xs text-muted-foreground mb-4 font-mono">ID: {invoiceId || 'N/A'}</p>
          <Button variant="outline" onClick={() => navigate('/')}><ArrowLeft className="mr-2 h-4 w-4" />Go Home</Button>
        </CardContent>
      </Card>
    );
  }

  if (pageState.type === 'payment_success') {
    const { invoice, paidAmount, txSignature } = pageState;
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Payment Sent!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              <span className="font-medium text-foreground">{formatAmount(paidAmount, invoice.tokenType)}</span> deposited into escrow.
            </p>
            <div className="p-4 rounded-lg bg-muted text-left space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono text-foreground">{invoice.invoiceId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount paid</span>
                <span className="text-foreground">{formatAmount(paidAmount, invoice.tokenType)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Installments</span>
                <span className="text-foreground">{installments.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="text-green-600 font-medium">In escrow</span>
              </div>
            </div>
            {installments.length > 1 && (
              <div className="p-3 rounded-lg bg-muted text-left mb-4">
                <p className="text-xs font-medium text-foreground mb-2">Release schedule</p>
                {installments.map((inst, i) => (
                  <div key={i} className="flex justify-between text-xs text-muted-foreground py-0.5">
                    <span>Installment {i + 1}</span>
                    <span>{inst.percentage}% — {formatAmount(paidAmount * inst.percentage / 100, invoice.tokenType)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-left mb-6">
              <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Funds are secured on-chain. The creator can only release according to the schedule you set.
              </p>
            </div>
            {txSignature && (
              <a href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mb-6">
                View on Solana Explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button className="w-full" onClick={() => navigate('/')}>Done</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Invoice Loaded
  const invoice = pageState.invoice;
  const totalAmount = fromSmallestUnit(invoice.amount, invoice.tokenType);
  const paidAmount = fromSmallestUnit(invoice.amountPaid, invoice.tokenType);
  const remaining = getRemainingAmount(invoice);
  const progressPercent = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
  const breakdown = calculateBreakdown(invoice);
  const isPaid = invoice.status === InvoiceStatus.FullyPaid || invoice.status === InvoiceStatus.Released;
  const isPartiallyPaid = invoice.status === InvoiceStatus.PartiallyPaid;

  return (
    <div className="max-w-md mx-auto">
      <Card>
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium text-foreground">Invoice {invoice.invoiceId}</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              invoice.status === InvoiceStatus.Unpaid ? 'status-unpaid' :
              invoice.status === InvoiceStatus.PartiallyPaid ? 'status-partial' :
              invoice.status === InvoiceStatus.FullyPaid ? 'status-paid' : 'status-released'
            }`}>
              {invoice.status === InvoiceStatus.Unpaid ? 'Unpaid' :
               invoice.status === InvoiceStatus.PartiallyPaid ? 'Partially Paid' :
               invoice.status === InvoiceStatus.FullyPaid ? 'Paid' : 'Released'}
            </span>
          </div>
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-1">Total Amount</p>
            <p className="text-3xl font-semibold text-foreground">{formatAmount(totalAmount, invoice.tokenType)}</p>
          </div>
          {(isPartiallyPaid || isPaid) && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Paid: {formatAmount(paidAmount, invoice.tokenType)}</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>
              <div className="progress-bar h-2">
                <div className={`progress-bar-fill h-full ${invoice.status === InvoiceStatus.Released ? 'progress-bar-fill-released' : ''}`}
                  style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}
          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${invoice.tokenType === TokenType.USDC ? 'token-usdc' : 'token-sol'}`}>
            {invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
          </span>
        </div>

        <CardContent className="p-6 space-y-4">
          <div className="space-y-3">
            <div className="p-3 rounded bg-muted">
              <p className="text-xs text-muted-foreground mb-0.5">From</p>
              <p className="text-sm text-foreground font-mono truncate">
                {creator ? `${creator.slice(0, 8)}...${creator.slice(-8)}` : 'Unknown'}
              </p>
            </div>
            {invoice.description && (
              <div className="p-3 rounded bg-muted">
                <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                <p className="text-sm text-foreground">{invoice.description}</p>
              </div>
            )}
          </div>

          {!isPaid && remaining > 0 && (
            <>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Your payment is held securely in a smart contract. You decide how funds are released to the creator.
                </p>
              </div>

              {/* Release Schedule Builder */}
              <div className="border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <Label className="text-sm font-medium">Release schedule</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">How should funds be released to the creator?</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addInstallment} disabled={installments.length >= 10}>
                    <Plus className="h-3 w-3 mr-1" />Add
                  </Button>
                </div>

                <div className="space-y-2 mb-3">
                  {installments.map((inst, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Installment {idx + 1}</span>
                      <div className="relative flex-1">
                        <Input
                          type="number"
                          value={inst.percentage || ''}
                          onChange={(e) => updateInstallment(idx, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          min="1"
                          max="100"
                          className="pr-7 h-8 text-sm"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                      </div>
                      <span className="text-xs text-muted-foreground w-24 text-right flex-shrink-0">
                        {inst.percentage > 0 ? formatAmount(breakdown.amount * inst.percentage / 100, invoice.tokenType) : '—'}
                      </span>
                      {installments.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeInstallment(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                <div className={`flex justify-between text-xs font-medium pt-2 border-t border-border ${totalPercentage === 100 ? 'text-green-600' : 'text-destructive'}`}>
                  <span>Total</span>
                  <span>{totalPercentage}% {totalPercentage === 100 ? '✓' : `(need ${100 - totalPercentage > 0 ? '+' : ''}${100 - totalPercentage}%)`}</span>
                </div>
                {scheduleError && <p className="text-xs text-destructive mt-2">{scheduleError}</p>}
              </div>

              {/* Payment Breakdown */}
              <div className="border-t border-border pt-4">
                <Label className="text-sm font-medium mb-2 block">Payment Amount</Label>
                <div className="p-3 rounded bg-muted space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-foreground">{formatAmount(breakdown.amount, invoice.tokenType)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Fee (1%)</span>
                    <span className="text-foreground">{formatAmount(breakdown.fee, invoice.tokenType)}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 border-t border-border">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground">{formatAmount(breakdown.total, invoice.tokenType)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                {!connected ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-center gap-2 p-3 rounded bg-muted">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Connect wallet to pay</span>
                    </div>
                    <WalletMultiButton className="!w-full !justify-center !bg-primary !text-primary-foreground hover:!bg-primary/90 !rounded-md !h-10" />
                  </div>
                ) : (
                  <Button onClick={handlePay} disabled={paying || breakdown.amount <= 0 || totalPercentage !== 100} className="w-full">
                    {paying ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>) : `Pay ${formatAmount(breakdown.total, invoice.tokenType)}`}
                  </Button>
                )}
              </div>
            </>
          )}

          {isPaid && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {invoice.status === InvoiceStatus.Released ? 'Payment Complete' : 'Fully Paid'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {invoice.status === InvoiceStatus.Released ? 'Funds have been released to the creator.' : 'This invoice has been fully paid. Awaiting release.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoicePayment;
