import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import { Loader2, AlertCircle, Check, ArrowLeft, Wallet, Shield, ExternalLink } from 'lucide-react';
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

const InvoicePayment: React.FC = () => {
  const { invoiceId, creator } = useParams<{ invoiceId: string; creator: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { toast } = useToast();

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [paying, setPaying] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'full' | 'partial'>('full');
  const [sdkInitError, setSdkInitError] = useState<string | null>(null);

  const urlParams = useMemo(() => {
    if (!invoiceId || !creator) {
      return { valid: false, error: 'Invalid invoice link - missing parameters' };
    }
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
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions },
        { commitment: 'confirmed' }
      );
      const instance = new EscrowPaySDK(provider);
      if (!instance.isInitialized()) {
        console.error('[InvoicePayment] SDK init failed:', instance.getInitError());
      }
      return instance;
    } catch (e) {
      console.error('[InvoicePayment] SDK creation error:', e);
      return null;
    }
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  const createReadOnlySdk = (conn: Connection): EscrowPaySDK | null => {
    try {
      const mockWallet = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      };
      const provider = new AnchorProvider(conn, mockWallet as any, { commitment: 'confirmed' });
      const sdkInstance = new EscrowPaySDK(provider);
      if (!sdkInstance.isInitialized()) {
        setSdkInitError(sdkInstance.getInitError());
        return null;
      }
      return sdkInstance;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown SDK error';
      setSdkInitError(errorMsg);
      return null;
    }
  };

  useEffect(() => {
    const fetchInvoice = async () => {
      if (!urlParams.valid) {
        setPageState({ type: 'error', message: urlParams.error || 'Invalid invoice link' });
        return;
      }
      const readOnlySdk = createReadOnlySdk(connection);
      if (!readOnlySdk) {
        setPageState({ type: 'error', message: sdkInitError || 'Failed to initialize. Please refresh.' });
        return;
      }
      try {
        const creatorPubkey = new PublicKey(urlParams.creator!);
        const result = await readOnlySdk.fetchInvoice(urlParams.invoiceId!, creatorPubkey);
        if (result.success && result.data) {
          setPageState({ type: 'invoice_loaded', invoice: result.data });
          setPaymentAmount(getRemainingAmount(result.data).toString());
        } else {
          setPageState({ type: 'error', message: result.error || 'Invoice not found' });
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load invoice';
        setPageState({ type: 'error', message: errorMsg });
      }
    };
    fetchInvoice();
  }, [connection, urlParams.valid, urlParams.invoiceId, urlParams.creator]);

  const getDecimals = (tokenType: TokenType) => tokenType === TokenType.USDC ? 6 : 9;

  const fromSmallestUnit = (amount: any, tokenType: TokenType) => {
    const decimals = getDecimals(tokenType);
    try {
      const val = amount?.toNumber ? amount.toNumber() : Number(amount || 0);
      return val / Math.pow(10, decimals);
    } catch {
      return 0;
    }
  };

  const getRemainingAmount = (inv: InvoiceData) => {
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    return Math.max(0, total - paid);
  };

  const formatAmount = (value: number, tokenType: TokenType) => {
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    const decimals = tokenType === TokenType.USDC ? 2 : 4;
    return `${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol}`;
  };

  const calculateBreakdown = (inv: InvoiceData) => {
    const amount = paymentMode === 'full' ? getRemainingAmount(inv) : parseFloat(paymentAmount) || 0;
    const fee = amount * (PLATFORM_FEE_BPS / 10000);
    const total = amount + fee;
    return { amount, fee, total };
  };

  const handlePay = async () => {
    if (pageState.type !== 'invoice_loaded') return;
    const invoice = pageState.invoice;

    if (!sdk || !connected || !publicKey || !creator) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }
    if (!sdk.isInitialized()) {
      toast({ title: 'SDK not ready', description: 'Please refresh and try again', variant: 'destructive' });
      return;
    }

    const breakdown = calculateBreakdown(invoice);

    if (breakdown.amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    const remaining = getRemainingAmount(invoice);
    if (breakdown.amount > remaining) {
      toast({ title: 'Amount exceeds remaining balance', variant: 'destructive' });
      return;
    }

    setPaying(true);
    try {
      const creatorPubkey = new PublicKey(creator);
      const result = await sdk.payInvoice(
        invoice.invoiceId,
        creatorPubkey,
        breakdown.amount,
        invoice.tokenType
      );

      if (result.success) {
        // Show success screen instead of just a toast
        const updated = await sdk.fetchInvoice(invoice.invoiceId, creatorPubkey);
        const updatedInvoice = updated.success && updated.data ? updated.data : invoice;
        setPageState({
          type: 'payment_success',
          invoice: updatedInvoice,
          paidAmount: breakdown.amount,
          txSignature: result.data?.signature || '',
        });
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : 'Payment failed';
        toast({ title: 'Payment failed', description: errorMsg, variant: 'destructive' });
      }
    } catch (error: unknown) {
      let msg = 'Transaction failed.';
      const errorStr = error instanceof Error ? error.message : String(error || '');
      if (errorStr.includes('User rejected') || errorStr.includes('rejected the request')) {
        msg = 'Transaction cancelled.';
      } else if (errorStr.toLowerCase().includes('insufficient')) {
        msg = 'Insufficient balance.';
      }
      toast({ title: 'Payment failed', description: msg, variant: 'destructive' });
    } finally {
      setPaying(false);
    }
  };

  // ==================== RENDER STATES ====================

  if (pageState.type === 'loading') {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading invoice...</p>
            {sdkInitError && <p className="text-xs text-destructive mt-2">{sdkInitError}</p>}
          </div>
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
          <Button variant="outline" onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Go Home
          </Button>
        </CardContent>
      </Card>
    );
  }

  // STATE: Payment Success
  if (pageState.type === 'payment_success') {
    const { invoice, paidAmount, txSignature } = pageState;
    const symbol = invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="py-10 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Payment Sent!</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Your payment of <span className="font-medium text-foreground">{formatAmount(paidAmount, invoice.tokenType)}</span> has been deposited into escrow.
            </p>

            <div className="p-4 rounded-lg bg-muted text-left space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice</span>
                <span className="font-mono text-foreground">{invoice.invoiceId}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount paid</span>
                <span className="text-foreground">{formatAmount(paidAmount, invoice.tokenType)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="text-green-600 font-medium">In escrow</span>
              </div>
            </div>

            {/* Escrow explanation */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 text-left mb-6">
              <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Your funds are held securely in a smart contract escrow. The creator cannot access them until they deliver the work and release the funds.
              </p>
            </div>

            {txSignature && (
              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 text-xs text-primary hover:underline mb-6"
              >
                View transaction on Solana Explorer
                <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <Button className="w-full" onClick={() => navigate('/')}>
              Done
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // STATE: Invoice Loaded
  const invoice = pageState.invoice;
  const totalAmount = fromSmallestUnit(invoice.amount, invoice.tokenType);
  const paidAmount = fromSmallestUnit(invoice.amountPaid, invoice.tokenType);
  const remaining = getRemainingAmount(invoice);
  const progressPercent = totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0;
  const breakdown = calculateBreakdown(invoice);
  const isPaid = invoice.status === InvoiceStatus.FullyPaid || invoice.status === InvoiceStatus.Released;
  const isPartiallyPaid = invoice.status === InvoiceStatus.PartiallyPaid;
  const symbol = invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL';

  return (
    <div className="max-w-md mx-auto">
      <Card>
        {/* Header */}
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
            <p className="text-3xl font-semibold text-foreground">
              {formatAmount(totalAmount, invoice.tokenType)}
            </p>
          </div>

          {(isPartiallyPaid || isPaid) && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Paid: {formatAmount(paidAmount, invoice.tokenType)}</span>
                <span>{progressPercent.toFixed(0)}%</span>
              </div>
              <div className="progress-bar h-2">
                <div
                  className={`progress-bar-fill h-full ${invoice.status === InvoiceStatus.Released ? 'progress-bar-fill-released' : ''}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
            invoice.tokenType === TokenType.USDC ? 'token-usdc' : 'token-sol'
          }`}>
            {invoice.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
          </span>
        </div>

        <CardContent className="p-6 space-y-4">
          {/* Details */}
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

          {/* Escrow explanation for first-time clients */}
          {!isPaid && remaining > 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
              <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Your payment is held securely in a smart contract. Funds are only released when you approve the work.
              </p>
            </div>
          )}

          {/* Payment Section */}
          {!isPaid && remaining > 0 && (
            <>
              <div className="border-t border-border pt-4">
                <Label className="text-sm font-medium mb-2 block">Payment Amount</Label>

                <div className="flex gap-2 mb-3">
                  <Button
                    type="button"
                    variant={paymentMode === 'full' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPaymentMode('full')}
                    className="flex-1"
                  >
                    Full ({formatAmount(remaining, invoice.tokenType)})
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMode === 'partial' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPaymentMode('partial')}
                    className="flex-1"
                  >
                    Partial
                  </Button>
                </div>

                {/* Fixed: partial input now shows currency label */}
                {paymentMode === 'partial' && (
                  <div className="mb-3">
                    <div className="relative">
                      <Input
                        type="number"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        placeholder="0.00"
                        step={invoice.tokenType === TokenType.USDC ? '0.01' : '0.0001'}
                        min="0"
                        max={remaining}
                        className="pr-16"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                        {symbol}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Max: {formatAmount(remaining, invoice.tokenType)}
                    </p>
                  </div>
                )}

                {/* Payment Breakdown */}
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

              {/* Wallet Connection / Pay Button */}
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
                  <Button
                    onClick={handlePay}
                    disabled={paying || breakdown.amount <= 0}
                    className="w-full"
                  >
                    {paying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Pay ${formatAmount(breakdown.total, invoice.tokenType)}`
                    )}
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Fully Paid State */}
          {isPaid && (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                <Check className="h-6 w-6 text-green-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                {invoice.status === InvoiceStatus.Released ? 'Payment Complete' : 'Fully Paid'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {invoice.status === InvoiceStatus.Released
                  ? 'Funds have been released to the creator.'
                  : 'This invoice has been fully paid. Awaiting release.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InvoicePayment;
