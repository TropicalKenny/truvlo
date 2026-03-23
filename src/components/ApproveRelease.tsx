import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import {
  Loader2, AlertCircle, ThumbsUp, AlertTriangle,
  Shield, Clock, Check, ArrowUpRight, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType } from '@/lib/escrowPaySDK';
import { useToast } from '@/hooks/use-toast';

type PageState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'loaded'; invoice: InvoiceData }
  | { type: 'approved' }
  | { type: 'disputed' };

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Auto-releasing soon';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

const ApproveRelease: React.FC = () => {
  const { invoiceId, creator } = useParams<{ invoiceId: string; creator: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { toast } = useToast();

  const [pageState, setPageState] = useState<PageState>({ type: 'loading' });
  const [approving, setApproving] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [sdkInitError, setSdkInitError] = useState<string | null>(null);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => clearInterval(interval);
  }, []);

  const urlValid = useMemo(() => {
    if (!invoiceId || !creator) return false;
    try { new PublicKey(creator); return true; } catch { return false; }
  }, [invoiceId, creator]);

  const sdk = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    try {
      const provider = new AnchorProvider(
        connection,
        { publicKey, signTransaction, signAllTransactions },
        { commitment: 'confirmed' }
      );
      return new EscrowPaySDK(provider);
    } catch { return null; }
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  const createReadOnlySdk = (conn: Connection): EscrowPaySDK | null => {
    try {
      const mock = {
        publicKey: new PublicKey('11111111111111111111111111111111'),
        signTransaction: async (tx: any) => tx,
        signAllTransactions: async (txs: any[]) => txs,
      };
      const provider = new AnchorProvider(conn, mock as any, { commitment: 'confirmed' });
      const instance = new EscrowPaySDK(provider);
      if (!instance.isInitialized()) { setSdkInitError(instance.getInitError()); return null; }
      return instance;
    } catch { return null; }
  };

  const fetchInvoice = async () => {
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
  };

  useEffect(() => { fetchInvoice(); }, [connection, urlValid]);

  const fromSmallestUnit = (amount: any, tokenType: TokenType) => {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      const raw = amount?.toNumber ? amount.toNumber() : Number(amount ?? 0);
      const int = BigInt(Math.round(raw));
      const divisor = BigInt(10 ** decimals);
      const whole = int / divisor;
      const remainder = int % divisor;
      return parseFloat(`${whole}.${remainder.toString().padStart(decimals, '0')}`);
    } catch { return 0; }
  };

  const formatAmount = (amount: any, tokenType: TokenType) => {
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    const decimals = tokenType === TokenType.USDC ? 2 : 4;
    const value = typeof amount === 'number' ? amount : fromSmallestUnit(amount, tokenType);
    return `${parseFloat(value.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals })} ${symbol}`;
  };

  const getSecondsRemaining = (inv: InvoiceData) => {
    if (!inv.completionRequestedAt) return -1;
    const req = inv.completionRequestedAt.toNumber
      ? inv.completionRequestedAt.toNumber()
      : Number(inv.completionRequestedAt);
    return Math.max(0, 7 * 24 * 60 * 60 - (now - req));
  };

  const handleApprove = async () => {
    if (!sdk || !connected) { toast({ title: 'Connect your wallet first', variant: 'destructive' }); return; }
    setApproving(true);
    try {
      const result = await sdk.approveRelease(invoiceId!, new PublicKey(creator!));
      if (result.success) {
        setPageState({ type: 'approved' });
      } else {
        toast({ title: 'Approval failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.';
      toast({ title: 'Approval failed', description: msg, variant: 'destructive' });
    } finally { setApproving(false); }
  };

  const handleDispute = async () => {
    if (!sdk || !connected) { toast({ title: 'Connect your wallet first', variant: 'destructive' }); return; }
    setDisputing(true);
    try {
      const result = await sdk.raiseDispute(invoiceId!, new PublicKey(creator!));
      if (result.success) {
        setPageState({ type: 'disputed' });
      } else {
        toast({ title: 'Dispute failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.';
      toast({ title: 'Dispute failed', description: msg, variant: 'destructive' });
    } finally { setDisputing(false); }
  };

  // ============================================================
  // RENDER STATES
  // ============================================================

  if (pageState.type === 'loading') {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="py-16 flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading invoice...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState.type === 'error') {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h3>
            <p className="text-sm text-muted-foreground mb-6">{pageState.message}</p>
            <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState.type === 'approved') {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Release approved</h2>
            <p className="text-sm text-muted-foreground mb-6">
              The creator can now withdraw the funds from escrow. Thank you for confirming.
            </p>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>View Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState.type === 'disputed') {
    return (
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">Dispute raised</h2>
            <p className="text-sm text-muted-foreground mb-2">
              Your funds are now frozen. A mediator will review the case and contact both parties.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Invoice: <span className="font-mono">{invoiceId}</span>
            </p>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>View Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // MAIN — invoice loaded
  // ============================================================

  const inv = pageState.invoice;
  const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
  const released = fromSmallestUnit(inv.amountReleased, inv.tokenType);
  const releaseable = Math.max(0, paid - released);
  const schedule = inv.releaseSchedule ?? [];
  const scheduleIdx = inv.currentReleaseIndex ?? 0;
  const hasSchedule = schedule.length > 0;
  const currentInstallmentBps = hasSchedule && scheduleIdx < schedule.length ? schedule[scheduleIdx] : null;
  const currentInstallmentAmount = currentInstallmentBps !== null
    ? parseFloat((paid * currentInstallmentBps / 10000).toFixed(inv.tokenType === TokenType.USDC ? 2 : 4))
    : releaseable;
  const secondsLeft = getSecondsRemaining(inv);
  const isDisputed = inv.status === InvoiceStatus.Disputed;
  const alreadyApproved = inv.clientApproved ?? false;
  const releaseRequested = !!inv.completionRequestedAt;
  const isReleased = inv.status === InvoiceStatus.Released;

  // Check if connected wallet is the client
  const isClient = publicKey && inv.client &&
    publicKey.toBase58() === inv.client.toBase58();

  // Can still act — window open, not yet approved, not disputed
  const canAct = releaseRequested && !alreadyApproved && !isDisputed && secondsLeft > 0;

  return (
    <div className="max-w-lg mx-auto space-y-4">

      {/* Invoice summary card */}
      <Card>
        <CardContent className="p-6">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <span className="font-mono text-xs text-muted-foreground">{inv.invoiceId}</span>
            <a
              href={`${window.location.origin}/invoice/${invoiceId}/${creator}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Full invoice <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Amount — hero */}
          <div className="mb-6">
            <p className="text-xs text-muted-foreground mb-1">
              {hasSchedule ? `Installment ${scheduleIdx + 1} of ${schedule.length} being requested` : 'Amount requested for release'}
            </p>
            <p className="text-4xl font-bold text-foreground tracking-tight">
              {formatAmount(currentInstallmentAmount, inv.tokenType)}
            </p>
            {hasSchedule && (
              <p className="text-sm text-muted-foreground mt-1">
                {currentInstallmentBps !== null ? currentInstallmentBps / 100 : 0}% of {formatAmount(paid, inv.tokenType)} total
              </p>
            )}
          </div>

          {/* Invoice details */}
          <div className="space-y-3 mb-6">
            {inv.description && (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-xs text-muted-foreground mb-0.5">Work description</p>
                <p className="text-sm text-foreground font-medium">{inv.description}</p>
              </div>
            )}
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground mb-0.5">Creator</p>
              <p className="text-sm font-mono text-foreground">
                {creator ? `${creator.slice(0, 8)}...${creator.slice(-8)}` : '—'}
              </p>
            </div>
          </div>

          {/* Status info */}
          {isReleased && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 mb-4">
              <ArrowUpRight className="h-5 w-5 text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400">Funds have been released to the creator.</p>
            </div>
          )}

          {isDisputed && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 mb-4 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-1">Dispute in progress</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Funds are frozen and under review. A mediator will contact both parties.
                </p>
              </div>
            </div>
          )}

          {alreadyApproved && !isDisputed && !isReleased && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 dark:bg-green-950/20 mb-4">
              <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-400">
                You already approved this release. The creator can now withdraw funds.
              </p>
            </div>
          )}

          {canAct && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 mb-4">
              <Clock className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {formatCountdown(secondsLeft)} — funds auto-release if you don't respond
              </p>
            </div>
          )}

          {secondsLeft === 0 && !alreadyApproved && !isDisputed && releaseRequested && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 mb-4">
              <Clock className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                7-day window expired — funds will auto-release to the creator shortly.
              </p>
            </div>
          )}

          {/* Escrow protection note */}
          {canAct && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted mb-6">
              <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Funds are held in a smart contract on Solana. Approving releases them to the creator.
                Disputing freezes them pending mediation.
              </p>
            </div>
          )}

          {/* Action area */}
          {canAct && (
            <>
              {!connected ? (
                <div className="space-y-3">
                  <p className="text-sm text-center text-muted-foreground">
                    Connect the wallet you paid with to respond
                  </p>
                  <WalletMultiButton className="!w-full !justify-center !bg-primary !text-primary-foreground hover:!bg-primary/90 !rounded-md !h-11" />
                </div>
              ) : !isClient ? (
                <div className="p-4 rounded-lg bg-muted text-center">
                  <p className="text-sm text-muted-foreground">
                    Connected wallet doesn't match the client who paid this invoice.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Please connect: {inv.client?.toBase58().slice(0, 8)}...{inv.client?.toBase58().slice(-8)}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    className="bg-green-600 hover:bg-green-700 text-white h-14 text-base font-medium"
                    onClick={handleApprove}
                    disabled={approving || disputing}
                  >
                    {approving ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving...</>
                    ) : (
                      <><ThumbsUp className="h-4 w-4 mr-2" />Approve Release</>
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 h-14 text-base font-medium"
                    onClick={handleDispute}
                    disabled={approving || disputing}
                  >
                    {disputing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Raising...</>
                    ) : (
                      <><AlertTriangle className="h-4 w-4 mr-2" />Raise Dispute</>
                    )}
                  </Button>
                </div>
              )}
            </>
          )}

        </CardContent>
      </Card>

      <p className="text-xs text-center text-muted-foreground">
        Powered by <span className="text-primary font-medium">Truvlo</span> — smart contract escrow on Solana
      </p>
    </div>
  );
};

export default ApproveRelease;
