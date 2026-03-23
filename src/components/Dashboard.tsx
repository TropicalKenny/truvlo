import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import {
  Plus, FileText, Clock, Check, ArrowUpRight, Loader2, Copy,
  RefreshCw, Bell, AlertTriangle, SendHorizonal, ThumbsUp, ArrowDownLeft, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType } from '@/lib/escrowPaySDK';
import { useToast } from '@/hooks/use-toast';
import { PublicKey } from '@solana/web3.js';
import ReleaseModal from './ReleaseModal';
import { NotificationList, NotificationHistory, useNotifications } from './NotificationProvider';

interface InvoiceWithKey {
  publicKey: PublicKey;
  account: InvoiceData;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Auto-releasing soon';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

const Dashboard: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { toast } = useToast();
  const { unreadCount, addNotification, markAllAsRead } = useNotifications();

  // Separate invoice lists for each role
  const [sentInvoices, setSentInvoices] = useState<InvoiceWithKey[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<InvoiceWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);

  const [roleTab, setRoleTab] = useState<'sent' | 'received'>('sent');
  const [sentFilter, setSentFilter] = useState('all');
  const [receivedFilter, setReceivedFilter] = useState('all');
  const [notifOpen, setNotifOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const [releaseModal, setReleaseModal] = useState<{
    open: boolean; invoiceId: string; amount: string;
    tokenType: TokenType; releaseableAmount: number;
  } | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleNotifOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open) markAllAsRead();
  };

  const sdk = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: 'confirmed' }
    );
    const instance = new EscrowPaySDK(provider);
    if (!instance.isInitialized()) console.error('SDK init error:', instance.getInitError());
    return instance;
  }, [connection, publicKey, signTransaction, signAllTransactions]);

  const fetchAll = useCallback(async () => {
    if (!sdk || !connected || !sdk.isInitialized()) {
      setSentInvoices([]); setReceivedInvoices([]); setLoading(false); return;
    }
    setLoading(true);
    try {
      const [sentResult, receivedResult] = await Promise.all([
        sdk.fetchInvoicesByCreator(),
        sdk.fetchInvoicesByClient(),
      ]);
      const sort = (arr: InvoiceWithKey[]) =>
        arr.sort((a, b) => {
          const at = a.account.createdAt.toNumber ? a.account.createdAt.toNumber() : 0;
          const bt = b.account.createdAt.toNumber ? b.account.createdAt.toNumber() : 0;
          return bt - at;
        });
      if (sentResult.success && sentResult.data) setSentInvoices(sort(sentResult.data));
      if (receivedResult.success && receivedResult.data) setReceivedInvoices(sort(receivedResult.data));
    } catch { setSentInvoices([]); setReceivedInvoices([]); }
    finally { setLoading(false); }
  }, [sdk, connected]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const h = () => fetchAll();
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  }, [fetchAll]);

  // ============================================================
  // HELPERS
  // ============================================================

  const fromSmallestUnit = (amount: any, tokenType: TokenType) => {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      // Use BigInt to avoid floating point precision loss (e.g. 1 SOL showing as 0.9999)
      const raw = amount?.toNumber ? amount.toNumber() : Number(amount ?? 0);
      const int = BigInt(Math.round(raw));
      const divisor = BigInt(10 ** decimals);
      const whole = int / divisor;
      const remainder = int % divisor;
      const fracStr = remainder.toString().padStart(decimals, '0');
      return parseFloat(`${whole}.${fracStr}`);
    } catch { return 0; }
  };

  const formatAmount = (amount: any, tokenType: TokenType): string => {
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    const decimals = tokenType === TokenType.USDC ? 2 : 4;
    const value = typeof amount === 'number' ? amount : fromSmallestUnit(amount, tokenType);
    return `${parseFloat(value.toFixed(decimals)).toLocaleString('en-US', { maximumFractionDigits: decimals })} ${symbol}`;
  };

  const formatDate = (timestamp: any): string => {
    try {
      const ts = timestamp.toNumber ? timestamp.toNumber() : Number(timestamp);
      return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return '-'; }
  };

  const formatStat = (usdc: number, sol: number) => {
    const lines = [];
    if (usdc > 0) lines.push(usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USDC');
    if (sol > 0) lines.push(sol.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' SOL');
    return lines.length > 0 ? lines : ['0'];
  };

  const getReleaseable = (invoice: InvoiceData) => {
    const paid = fromSmallestUnit(invoice.amountPaid, invoice.tokenType);
    const released = fromSmallestUnit(invoice.amountReleased, invoice.tokenType);
    return Math.max(0, paid - released);
  };

  const getSecondsRemaining = (inv: InvoiceData): number => {
    if (!inv.completionRequestedAt) return -1;
    const req = inv.completionRequestedAt.toNumber ? inv.completionRequestedAt.toNumber() : Number(inv.completionRequestedAt);
    return Math.max(0, 7 * 24 * 60 * 60 - (now - req));
  };

  const isReleaseReady = (inv: InvoiceData) =>
    inv.clientApproved || (!!inv.completionRequestedAt && getSecondsRemaining(inv) === 0);

  // ============================================================
  // ACTIONS — CREATOR (SENT)
  // ============================================================

  const handleRequestRelease = async (inv: InvoiceData) => {
    if (!sdk || !publicKey) return;
    setRequesting(inv.invoiceId);
    try {
      const result = await sdk.requestRelease(inv.invoiceId, inv.tokenType);
      if (result.success) {
        // Send email notification to client
        try {
          await fetch('/api/notify-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              invoiceId: inv.invoiceId,
              clientEmail: inv.clientEmail,
              creatorWallet: publicKey.toBase58(),
              amount: formatAmount(inv.amountPaid, inv.tokenType),
              description: inv.description || '',
              senderName: inv.senderName || '',
              invoiceUrl: `${window.location.origin}/invoice/${inv.invoiceId}/${publicKey.toBase58()}`,
            }),
          });
        } catch { /* email failure is non-blocking */ }

        toast({ title: 'Release requested', description: 'Client has been notified by email.' });
        addNotification({
          type: 'info',
          title: 'Release Requested',
          message: `7-day window started for ${inv.invoiceId}. Email sent to ${inv.clientEmail}.`,
        });
        await fetchAll();
      } else {
        toast({ title: 'Request failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error && error.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.';
      toast({ title: 'Request failed', description: msg, variant: 'destructive' });
    } finally { setRequesting(null); }
  };

  const openReleaseModal = (invoice: InvoiceData) => {
    const releaseableAmount = getReleaseable(invoice);
    const schedule = invoice.releaseSchedule ?? [];
    const idx = invoice.currentReleaseIndex ?? 0;
    let installmentAmount = releaseableAmount;
    let installmentLabel = '';
    if (schedule.length > 0 && idx < schedule.length) {
      const bps = schedule[idx];
      installmentAmount = parseFloat((fromSmallestUnit(invoice.amountPaid, invoice.tokenType) * bps / 10000).toFixed(invoice.tokenType === TokenType.USDC ? 6 : 9));
      installmentLabel = `Installment ${idx + 1} of ${schedule.length} (${bps / 100}%)`;
    }
    setReleaseModal({ open: true, invoiceId: invoice.invoiceId, amount: installmentLabel || formatAmount(invoice.amountPaid, invoice.tokenType), tokenType: invoice.tokenType, releaseableAmount: installmentAmount });
  };

  const handleReleaseFunds = async () => {
    if (!sdk || !releaseModal) return;
    setReleasing(releaseModal.invoiceId);
    try {
      const result = await sdk.releaseFunds(releaseModal.invoiceId, releaseModal.releaseableAmount, releaseModal.tokenType);
      if (result.success) {
        toast({ title: 'Funds released to wallet' });
        const symbol = releaseModal.tokenType === TokenType.USDC ? 'USDC' : 'SOL';
        const decimals = releaseModal.tokenType === TokenType.USDC ? 2 : 4;
        addNotification({
          type: 'success',
          title: 'Funds Released',
          message: `Released ${releaseModal.releaseableAmount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol} from ${releaseModal.invoiceId}`,
        });
        await fetchAll();
      } else {
        toast({ title: 'Release failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (error: unknown) {
      toast({ title: 'Release failed', description: error instanceof Error && error.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setReleasing(null); setReleaseModal(null); }
  };

  const handleCopyLink = async (invoiceId: string, creatorKey?: string) => {
    const creator = creatorKey || publicKey?.toBase58();
    const url = `${window.location.origin}/invoice/${invoiceId}/${creator}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied' });
    } catch { toast({ title: 'Failed to copy', variant: 'destructive' }); }
  };

  // ============================================================
  // ACTIONS — CLIENT (RECEIVED)
  // ============================================================

  const handleApprove = async (inv: InvoiceData) => {
    if (!sdk) return;
    setApproving(inv.invoiceId);
    try {
      const result = await sdk.approveRelease(inv.invoiceId, inv.creator);
      if (result.success) {
        toast({ title: 'Release approved', description: 'The creator can now withdraw the funds.' });
        addNotification({ type: 'success', title: 'Release Approved', message: `You approved release for ${inv.invoiceId}.` });
        await fetchAll();
      } else {
        toast({ title: 'Approval failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (error: unknown) {
      toast({ title: 'Approval failed', description: error instanceof Error && error.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setApproving(null); }
  };

  const handleDispute = async (inv: InvoiceData) => {
    if (!sdk) return;
    setDisputing(inv.invoiceId);
    try {
      const result = await sdk.raiseDispute(inv.invoiceId, inv.creator);
      if (result.success) {
        toast({ title: 'Dispute raised', description: 'Funds are frozen. A mediator will review your case.' });
        addNotification({ type: 'warning', title: 'Dispute Raised', message: `Dispute opened for ${inv.invoiceId}. Funds frozen pending review.` });
        await fetchAll();
      } else {
        toast({ title: 'Dispute failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (error: unknown) {
      toast({ title: 'Dispute failed', description: error instanceof Error && error.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setDisputing(null); }
  };

  // ============================================================
  // STATS
  // ============================================================

  const sentStats = {
    total: sentInvoices.length,
    unpaid: sentInvoices.filter(i => i.account.status === InvoiceStatus.Unpaid).length,
    inEscrow: sentInvoices.filter(i => i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid || i.account.status === InvoiceStatus.Disputed).length,
    released: sentInvoices.filter(i => i.account.status === InvoiceStatus.Released).length,
    disputed: sentInvoices.filter(i => i.account.status === InvoiceStatus.Disputed).length,
    pendingReleaseUSDC: sentInvoices.filter(i => i.account.status === InvoiceStatus.FullyPaid && i.account.tokenType === TokenType.USDC)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.USDC) - fromSmallestUnit(i.account.amountReleased, TokenType.USDC), 0),
    pendingReleaseSOL: sentInvoices.filter(i => i.account.status === InvoiceStatus.FullyPaid && i.account.tokenType === TokenType.SOL)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.SOL) - fromSmallestUnit(i.account.amountReleased, TokenType.SOL), 0),
  };

  const receivedStats = {
    total: receivedInvoices.length,
    awaitingApproval: receivedInvoices.filter(i => !!i.account.completionRequestedAt && !i.account.clientApproved && i.account.status !== InvoiceStatus.Disputed).length,
    disputed: receivedInvoices.filter(i => i.account.status === InvoiceStatus.Disputed).length,
    released: receivedInvoices.filter(i => i.account.status === InvoiceStatus.Released).length,
    totalPaidUSDC: receivedInvoices.filter(i => i.account.tokenType === TokenType.USDC)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.USDC), 0),
    totalPaidSOL: receivedInvoices.filter(i => i.account.tokenType === TokenType.SOL)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.SOL), 0),
  };

  // Action-needed badge on Received tab
  const receivedActionCount = receivedStats.awaitingApproval;

  // Filter invoices
  const filteredSent = sentFilter === 'all' ? sentInvoices : sentInvoices.filter(i => {
    if (sentFilter === 'unpaid') return i.account.status === InvoiceStatus.Unpaid;
    if (sentFilter === 'escrow') return i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid;
    if (sentFilter === 'released') return i.account.status === InvoiceStatus.Released;
    if (sentFilter === 'disputed') return i.account.status === InvoiceStatus.Disputed;
    return true;
  });

  const filteredReceived = receivedFilter === 'all' ? receivedInvoices : receivedInvoices.filter(i => {
    if (receivedFilter === 'pending') return !!i.account.completionRequestedAt && !i.account.clientApproved;
    if (receivedFilter === 'disputed') return i.account.status === InvoiceStatus.Disputed;
    if (receivedFilter === 'released') return i.account.status === InvoiceStatus.Released;
    return true;
  });

  if (!connected) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Connect your wallet to view your dashboard.</p>
        </CardContent>
      </Card>
    );
  }

  // ============================================================
  // SHARED CARD RENDERER
  // ============================================================

  const renderSentCard = (invoice: InvoiceWithKey) => {
    const inv = invoice.account;
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    const progressPercent = total > 0 ? (paid / total) * 100 : 0;
    const releaseable = getReleaseable(inv);
    const schedule = inv.releaseSchedule ?? [];
    const scheduleIdx = inv.currentReleaseIndex ?? 0;
    const hasSchedule = schedule.length > 0;
    const currentInstallmentBps = hasSchedule && scheduleIdx < schedule.length ? schedule[scheduleIdx] : null;
    const currentInstallmentAmount = currentInstallmentBps !== null
      ? parseFloat((paid * currentInstallmentBps / 10000).toFixed(inv.tokenType === TokenType.USDC ? 2 : 4))
      : releaseable;
    const isDisputed = inv.status === InvoiceStatus.Disputed;
    const releaseRequested = !!inv.completionRequestedAt;
    const releaseReady = isReleaseReady(inv);
    const secondsLeft = getSecondsRemaining(inv);
    const canRequest = (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid)
      && !isDisputed && !releaseRequested && releaseable > 0;

    const borderColor = isDisputed ? 'border-l-amber-500' :
      inv.status === InvoiceStatus.Unpaid ? 'border-l-orange-400' :
      inv.status === InvoiceStatus.PartiallyPaid ? 'border-l-blue-400' :
      inv.status === InvoiceStatus.FullyPaid ? 'border-l-blue-500' : 'border-l-green-400';

    return (
      <Card key={inv.invoiceId} className={`clean-card border-l-4 ${borderColor}`}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{inv.invoiceId}</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  isDisputed ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  inv.status === InvoiceStatus.Unpaid ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                  inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                }`}>
                  {isDisputed && <><AlertTriangle className="h-3 w-3" />Disputed</>}
                  {!isDisputed && inv.status === InvoiceStatus.Unpaid && <><Clock className="h-3 w-3" />Unpaid</>}
                  {!isDisputed && inv.status === InvoiceStatus.PartiallyPaid && <><Clock className="h-3 w-3" />Partial</>}
                  {!isDisputed && inv.status === InvoiceStatus.FullyPaid && <><Check className="h-3 w-3" />Paid</>}
                  {!isDisputed && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" />Released</>}
                </span>
                <Badge className={`text-xs ${inv.tokenType === TokenType.USDC ? 'token-usdc' : 'token-sol'}`}>
                  {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
                </Badge>
              </div>
              <p className="text-lg font-semibold text-foreground mb-1">{formatAmount(inv.amount, inv.tokenType)}</p>
              {inv.description && <p className="text-xs font-medium text-foreground mb-0.5 truncate">{inv.description}</p>}
              <p className="text-xs text-muted-foreground">{inv.clientEmail} • {formatDate(inv.createdAt)}</p>
              {hasSchedule && !isDisputed && (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Next: {formatAmount(currentInstallmentAmount, inv.tokenType)} ({currentInstallmentBps !== null ? currentInstallmentBps / 100 : 0}%) — installment {scheduleIdx + 1} of {schedule.length}
                </p>
              )}
              {isDisputed && <p className="text-xs text-amber-500 mt-1">Funds frozen — dispute under review</p>}
              {releaseRequested && !isDisputed && !releaseReady && (
                <p className="text-xs text-blue-500 mt-1">Release requested · {formatCountdown(secondsLeft)}</p>
              )}
              {releaseRequested && !isDisputed && releaseReady && (
                <p className="text-xs text-green-500 mt-1">
                  {inv.clientApproved ? 'Client approved — ready to release' : 'Timeout passed — ready to release'}
                </p>
              )}
              {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid || isDisputed) && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Paid: {formatAmount(inv.amountPaid, inv.tokenType)}</span>
                    <span>{progressPercent.toFixed(0)}%</span>
                  </div>
                  <div className="progress-bar h-1.5">
                    <div className={`progress-bar-fill h-full ${isDisputed ? 'bg-amber-500' : ''}`} style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Button variant="outline" size="sm" onClick={() => handleCopyLink(inv.invoiceId)}>
                <Copy className="h-3.5 w-3.5 mr-1" />Copy Link
              </Button>
              {canRequest && (
                <Button size="sm" variant="outline"
                  className="border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  onClick={() => handleRequestRelease(inv)} disabled={requesting === inv.invoiceId}>
                  {requesting === inv.invoiceId
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Requesting...</>
                    : <><SendHorizonal className="h-3.5 w-3.5 mr-1" />Request Release</>}
                </Button>
              )}
              {releaseRequested && !isDisputed && releaseReady && releaseable > 0 && (
                <div className="flex flex-col items-end gap-1">
                  {hasSchedule && (
                    <div className="flex items-center gap-1">
                      {schedule.map((_: number, i: number) => (
                        <span key={i} className={`w-2 h-2 rounded-full ${i < scheduleIdx ? 'bg-green-400' : i === scheduleIdx ? 'bg-amber-400' : 'bg-muted-foreground/30'}`} />
                      ))}
                      <span className="text-xs text-muted-foreground ml-1">{scheduleIdx + 1}/{schedule.length}</span>
                    </div>
                  )}
                  <Button size="sm" className="bg-accent hover:bg-accent/90 text-accent-foreground"
                    onClick={() => openReleaseModal(inv)} disabled={releasing === inv.invoiceId}>
                    <Check className="h-3.5 w-3.5 mr-1" />
                    {hasSchedule ? `Release ${formatAmount(currentInstallmentAmount, inv.tokenType)}` : `Release ${formatAmount(releaseable, inv.tokenType)}`}
                  </Button>
                </div>
              )}
              {releaseRequested && !isDisputed && !releaseReady && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />Awaiting client
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderReceivedCard = (invoice: InvoiceWithKey) => {
    const inv = invoice.account;
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    const released = fromSmallestUnit(inv.amountReleased, inv.tokenType);
    const progressPercent = total > 0 ? (paid / total) * 100 : 0;
    const schedule = inv.releaseSchedule ?? [];
    const scheduleIdx = inv.currentReleaseIndex ?? 0;
    const isDisputed = inv.status === InvoiceStatus.Disputed;
    const releaseRequested = !!inv.completionRequestedAt;
    const clientApproved = inv.clientApproved ?? false;
    const secondsLeft = getSecondsRemaining(inv);
    const autoReleaseExpired = releaseRequested && secondsLeft === 0;
    const needsAction = releaseRequested && !clientApproved && !isDisputed && !autoReleaseExpired;

    const borderColor = isDisputed ? 'border-l-amber-500' :
      needsAction ? 'border-l-blue-500' :
      inv.status === InvoiceStatus.Released ? 'border-l-green-400' : 'border-l-muted';

    return (
      <Card key={inv.invoiceId} className={`clean-card border-l-4 ${borderColor}`}>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-mono text-xs text-muted-foreground">{inv.invoiceId}</span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                  isDisputed ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  needsAction ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                  clientApproved ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  inv.status === InvoiceStatus.Released ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isDisputed && <><AlertTriangle className="h-3 w-3" />Disputed</>}
                  {!isDisputed && needsAction && <><Clock className="h-3 w-3" />Action needed</>}
                  {!isDisputed && clientApproved && !needsAction && <><Check className="h-3 w-3" />Approved</>}
                  {!isDisputed && !needsAction && !clientApproved && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" />Released</>}
                  {!isDisputed && !needsAction && !clientApproved && inv.status !== InvoiceStatus.Released && <><Check className="h-3 w-3" />In escrow</>}
                </span>
                <Badge className={`text-xs ${inv.tokenType === TokenType.USDC ? 'token-usdc' : 'token-sol'}`}>
                  {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
                </Badge>
              </div>

              <p className="text-lg font-semibold text-foreground mb-1">{formatAmount(inv.amount, inv.tokenType)}</p>
              {inv.description && <p className="text-xs font-medium text-foreground mb-0.5 truncate">{inv.description}</p>}
              <p className="text-xs text-muted-foreground">
                To: {inv.creator.toBase58().slice(0, 8)}...{inv.creator.toBase58().slice(-8)} • {formatDate(inv.createdAt)}
              </p>

              {/* Schedule progress */}
              {schedule.length > 1 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Installment {scheduleIdx + 1} of {schedule.length} — {formatAmount(released, inv.tokenType)} released of {formatAmount(paid, inv.tokenType)}
                </p>
              )}

              {isDisputed && <p className="text-xs text-amber-500 mt-1">Funds frozen — dispute under review</p>}
              {needsAction && <p className="text-xs text-blue-500 mt-1">Creator requested release · {formatCountdown(secondsLeft)}</p>}
              {autoReleaseExpired && !clientApproved && !isDisputed && (
                <p className="text-xs text-amber-500 mt-1">Timeout passed — funds will auto-release shortly</p>
              )}
              {clientApproved && !isDisputed && <p className="text-xs text-green-600 mt-1">You approved this release</p>}

              {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid || isDisputed) && (
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Paid: {formatAmount(inv.amountPaid, inv.tokenType)}</span>
                    <span>{progressPercent.toFixed(0)}%</span>
                  </div>
                  <div className="progress-bar h-1.5">
                    <div className={`progress-bar-fill h-full ${isDisputed ? 'bg-amber-500' : ''}`} style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 items-end">
              <Button variant="outline" size="sm"
                onClick={() => window.open(`${window.location.origin}/invoice/${inv.invoiceId}/${inv.creator.toBase58()}`, '_blank')}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" />View Invoice
              </Button>

              {needsAction && (
                <div className="flex gap-2">
                  <Button size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => handleApprove(inv)}
                    disabled={approving === inv.invoiceId || disputing === inv.invoiceId}>
                    {approving === inv.invoiceId
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Approving...</>
                      : <><ThumbsUp className="h-3.5 w-3.5 mr-1" />Approve</>}
                  </Button>
                  <Button size="sm" variant="outline"
                    className="border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                    onClick={() => handleDispute(inv)}
                    disabled={approving === inv.invoiceId || disputing === inv.invoiceId}>
                    {disputing === inv.invoiceId
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />...</>
                      : <><AlertTriangle className="h-3.5 w-3.5 mr-1" />Dispute</>}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {publicKey ? `${publicKey.toBase58().slice(0, 8)}...${publicKey.toBase58().slice(-8)}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Popover open={notifOpen} onOpenChange={handleNotifOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <NotificationList onViewAll={() => { setNotifOpen(false); setShowHistory(true); }} />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={fetchAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Link to="/create">
            <Button className="bg-secondary hover:bg-secondary/90">
              <Plus className="mr-2 h-4 w-4" />Create Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Role tabs */}
      <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as 'sent' | 'received')}>
        <TabsList className="bg-muted">
          <TabsTrigger value="sent" className="flex items-center gap-1.5">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Sent ({sentStats.total})
          </TabsTrigger>
          <TabsTrigger value="received" className="flex items-center gap-1.5 relative">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Received ({receivedStats.total})
            {receivedActionCount > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-blue-500 text-[10px] text-white flex items-center justify-center">
                {receivedActionCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ======= SENT TAB ======= */}
        <TabsContent value="sent" className="mt-4 space-y-4">
          {/* Sent stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Pending Release</p>
                {formatStat(sentStats.pendingReleaseUSDC, sentStats.pendingReleaseSOL).map((l, i) => (
                  <p key={i} className={`text-base font-semibold leading-snug ${l === '0' ? 'text-muted-foreground' : 'text-amber-500'}`}>{l}</p>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">In Escrow</p>
                <p className="text-2xl font-semibold text-blue-500">{sentStats.inEscrow}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Released</p>
                <p className="text-2xl font-semibold text-green-500">{sentStats.released}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Invoices</p>
                <p className="text-2xl font-semibold text-foreground">{sentStats.total}</p>
                <div className="flex gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{sentStats.unpaid} unpaid</span>
                  {sentStats.disputed > 0 && <><span className="text-xs text-muted-foreground">•</span><span className="text-xs text-amber-500">{sentStats.disputed} disputed</span></>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sent filter tabs */}
          <Tabs value={sentFilter} onValueChange={setSentFilter}>
            <TabsList className="bg-muted flex-wrap h-auto gap-1">
              <TabsTrigger value="all">All ({sentStats.total})</TabsTrigger>
              <TabsTrigger value="unpaid">Unpaid ({sentStats.unpaid})</TabsTrigger>
              <TabsTrigger value="escrow">In Escrow ({sentStats.inEscrow})</TabsTrigger>
              <TabsTrigger value="released">Released ({sentStats.released})</TabsTrigger>
              {sentStats.disputed > 0 && <TabsTrigger value="disputed" className="text-amber-500">Disputed ({sentStats.disputed})</TabsTrigger>}
            </TabsList>
            <TabsContent value={sentFilter} className="mt-3">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredSent.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-base font-semibold text-foreground mb-2">No invoices yet</h3>
                    <Link to="/create"><Button><Plus className="mr-2 h-4 w-4" />Create Invoice</Button></Link>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">{filteredSent.map(renderSentCard)}</div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ======= RECEIVED TAB ======= */}
        <TabsContent value="received" className="mt-4 space-y-4">
          {/* Received stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Total Paid</p>
                {formatStat(receivedStats.totalPaidUSDC, receivedStats.totalPaidSOL).map((l, i) => (
                  <p key={i} className="text-base font-semibold text-foreground leading-snug">{l}</p>
                ))}
              </CardContent>
            </Card>
            <Card className={receivedActionCount > 0 ? 'border-l-4 border-l-blue-500' : ''}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Needs Approval</p>
                <p className={`text-2xl font-semibold ${receivedActionCount > 0 ? 'text-blue-500' : 'text-muted-foreground'}`}>{receivedActionCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Released</p>
                <p className="text-2xl font-semibold text-green-500">{receivedStats.released}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-2">Invoices</p>
                <p className="text-2xl font-semibold text-foreground">{receivedStats.total}</p>
                {receivedStats.disputed > 0 && <p className="text-xs text-amber-500 mt-1">{receivedStats.disputed} disputed</p>}
              </CardContent>
            </Card>
          </div>

          {/* Received filter tabs */}
          <Tabs value={receivedFilter} onValueChange={setReceivedFilter}>
            <TabsList className="bg-muted flex-wrap h-auto gap-1">
              <TabsTrigger value="all">All ({receivedStats.total})</TabsTrigger>
              {receivedStats.awaitingApproval > 0 && <TabsTrigger value="pending" className="text-blue-500">Action needed ({receivedStats.awaitingApproval})</TabsTrigger>}
              <TabsTrigger value="released">Released ({receivedStats.released})</TabsTrigger>
              {receivedStats.disputed > 0 && <TabsTrigger value="disputed" className="text-amber-500">Disputed ({receivedStats.disputed})</TabsTrigger>}
            </TabsList>
            <TabsContent value={receivedFilter} className="mt-3">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : filteredReceived.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-12 text-center">
                    <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">No invoices paid from this wallet yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">{filteredReceived.map(renderReceivedCard)}</div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Release Modal */}
      {releaseModal && (
        <ReleaseModal
          open={releaseModal.open}
          onClose={() => setReleaseModal(null)}
          onConfirm={handleReleaseFunds}
          amount={releaseModal.amount}
          isReleasing={releasing === releaseModal.invoiceId}
        />
      )}

      {showHistory && <NotificationHistory onClose={() => setShowHistory(false)} />}
    </div>
  );
};

export default Dashboard;
