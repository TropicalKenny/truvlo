import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import {
  Plus, FileText, Clock, Check, ArrowUpRight,
  Loader2, Copy, RefreshCw, Bell, AlertTriangle, SendHorizonal
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

// Format seconds remaining into human-readable countdown
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
  const { notifications, unreadCount, addNotification, markAllAsRead } = useNotifications();

  const [invoices, setInvoices] = useState<InvoiceWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [notifOpen, setNotifOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const [releaseModal, setReleaseModal] = useState<{
    open: boolean;
    invoiceId: string;
    amount: string;
    tokenType: TokenType;
    releaseableAmount: number;
  } | null>(null);

  // Tick every minute to update countdowns
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

  const fetchInvoices = useCallback(async () => {
    if (!sdk || !connected || !sdk.isInitialized()) {
      setInvoices([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await sdk.fetchInvoicesByCreator();
      if (result.success && result.data) {
        const sorted = result.data.sort((a, b) => {
          const aTime = a.account.createdAt.toNumber ? a.account.createdAt.toNumber() : 0;
          const bTime = b.account.createdAt.toNumber ? b.account.createdAt.toNumber() : 0;
          return bTime - aTime;
        });
        setInvoices(sorted);
      }
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [sdk, connected]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  useEffect(() => {
    const handleFocus = () => fetchInvoices();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchInvoices]);

  // ============================================================
  // HELPERS
  // ============================================================

  const fromSmallestUnit = (amount: any, tokenType: TokenType) => {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      const val = amount.toNumber ? amount.toNumber() : Number(amount);
      return parseFloat((val / Math.pow(10, decimals)).toFixed(decimals));
    } catch { return 0; }
  };

  const formatAmount = (amount: any, tokenType: TokenType): string => {
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    const decimals = tokenType === TokenType.USDC ? 2 : 4;
    const value = typeof amount === 'number' ? amount : fromSmallestUnit(amount, tokenType);
    // Smart formatting — strip trailing zeros
    const formatted = parseFloat(value.toFixed(decimals));
    return `${formatted.toLocaleString('en-US', { maximumFractionDigits: decimals })} ${symbol}`;
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

  const getAutoReleaseSecondsRemaining = (invoice: InvoiceData): number => {
    if (!invoice.completionRequestedAt) return -1;
    const requestedAt = invoice.completionRequestedAt.toNumber
      ? invoice.completionRequestedAt.toNumber()
      : Number(invoice.completionRequestedAt);
    const elapsed = now - requestedAt;
    return Math.max(0, 7 * 24 * 60 * 60 - elapsed);
  };

  const isReleaseReady = (invoice: InvoiceData): boolean => {
    if (invoice.clientApproved) return true;
    if (!invoice.completionRequestedAt) return false;
    return getAutoReleaseSecondsRemaining(invoice) === 0;
  };

  // ============================================================
  // ACTIONS
  // ============================================================

  const handleRequestRelease = async (inv: InvoiceData) => {
    if (!sdk) return;
    setRequesting(inv.invoiceId);
    try {
      const result = await sdk.requestRelease(inv.invoiceId, inv.tokenType);
      if (result.success) {
        toast({ title: 'Release requested' });
        addNotification({
          type: 'info',
          title: 'Release Requested',
          message: `7-day approval window started for ${inv.invoiceId}. Client has been notified.`,
        });
        await fetchInvoices();
      } else {
        const msg = typeof result.error === 'string' ? result.error : 'Request failed';
        toast({ title: 'Request failed', description: msg, variant: 'destructive' });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error && error.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.';
      toast({ title: 'Request failed', description: msg, variant: 'destructive' });
    } finally {
      setRequesting(null);
    }
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
    setReleaseModal({
      open: true,
      invoiceId: invoice.invoiceId,
      amount: installmentLabel || formatAmount(invoice.amountPaid, invoice.tokenType),
      tokenType: invoice.tokenType,
      releaseableAmount: installmentAmount,
    });
  };

  const handleReleaseFunds = async () => {
    if (!sdk || !releaseModal) return;
    setReleasing(releaseModal.invoiceId);
    try {
      const result = await sdk.releaseFunds(releaseModal.invoiceId, releaseModal.releaseableAmount, releaseModal.tokenType);
      if (result.success) {
        toast({ title: 'Funds released' });
        const symbol = releaseModal.tokenType === TokenType.USDC ? 'USDC' : 'SOL';
        const decimals = releaseModal.tokenType === TokenType.USDC ? 2 : 4;
        const displayAmount = `${releaseModal.releaseableAmount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol}`;
        addNotification({
          type: 'success',
          title: 'Funds Released',
          message: `Released ${displayAmount} from ${releaseModal.invoiceId}`,
        });
        await fetchInvoices();
      } else {
        const errorMsg = typeof result.error === 'string' ? result.error : 'Release failed';
        toast({ title: 'Release failed', description: errorMsg, variant: 'destructive' });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error && error.message.includes('rejected') ? 'Transaction cancelled.' : 'Transaction failed.';
      toast({ title: 'Release failed', description: msg, variant: 'destructive' });
    } finally {
      setReleasing(null);
      setReleaseModal(null);
    }
  };

  const handleCopyLink = async (invoiceId: string) => {
    const url = `${window.location.origin}/invoice/${invoiceId}/${publicKey?.toBase58()}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Link copied' });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  // ============================================================
  // STATS
  // ============================================================

  const stats = {
    total: invoices.length,
    unpaid: invoices.filter(i => i.account.status === InvoiceStatus.Unpaid).length,
    inEscrow: invoices.filter(i =>
      i.account.status === InvoiceStatus.PartiallyPaid ||
      i.account.status === InvoiceStatus.FullyPaid ||
      i.account.status === InvoiceStatus.Disputed
    ).length,
    released: invoices.filter(i => i.account.status === InvoiceStatus.Released).length,
    disputed: invoices.filter(i => i.account.status === InvoiceStatus.Disputed).length,
    totalReceivedUSDC: invoices.filter(i => i.account.tokenType === TokenType.USDC)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.USDC), 0),
    totalReceivedSOL: invoices.filter(i => i.account.tokenType === TokenType.SOL)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.SOL), 0),
    inEscrowUSDC: invoices.filter(i =>
      (i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid || i.account.status === InvoiceStatus.Disputed) &&
      i.account.tokenType === TokenType.USDC
    ).reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.USDC) - fromSmallestUnit(i.account.amountReleased, TokenType.USDC), 0),
    inEscrowSOL: invoices.filter(i =>
      (i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid || i.account.status === InvoiceStatus.Disputed) &&
      i.account.tokenType === TokenType.SOL
    ).reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.SOL) - fromSmallestUnit(i.account.amountReleased, TokenType.SOL), 0),
    pendingReleaseUSDC: invoices.filter(i => i.account.status === InvoiceStatus.FullyPaid && i.account.tokenType === TokenType.USDC)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.USDC) - fromSmallestUnit(i.account.amountReleased, TokenType.USDC), 0),
    pendingReleaseSOL: invoices.filter(i => i.account.status === InvoiceStatus.FullyPaid && i.account.tokenType === TokenType.SOL)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.SOL) - fromSmallestUnit(i.account.amountReleased, TokenType.SOL), 0),
  };

  const filteredInvoices = activeTab === 'all' ? invoices : invoices.filter(i => {
    if (activeTab === 'unpaid') return i.account.status === InvoiceStatus.Unpaid;
    if (activeTab === 'escrow') return i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid;
    if (activeTab === 'released') return i.account.status === InvoiceStatus.Released;
    if (activeTab === 'disputed') return i.account.status === InvoiceStatus.Disputed;
    return true;
  });

  if (!connected) {
    return (
      <Card className="max-w-md mx-auto">
        <CardContent className="py-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">Connect your wallet to view invoices.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage your invoices</p>
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
          <Button variant="outline" size="icon" onClick={fetchInvoices} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Link to="/create">
            <Button className="bg-secondary hover:bg-secondary/90">
              <Plus className="mr-2 h-4 w-4" />
              Create Invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Total Received</p>
            {formatStat(stats.totalReceivedUSDC, stats.totalReceivedSOL).map((line, i) => (
              <p key={i} className="text-base font-semibold text-foreground leading-snug">{line}</p>
            ))}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">In Escrow</p>
            {formatStat(stats.inEscrowUSDC, stats.inEscrowSOL).map((line, i) => (
              <p key={i} className={`text-base font-semibold leading-snug ${line === '0' ? 'text-muted-foreground' : 'text-blue-500'}`}>{line}</p>
            ))}
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${stats.disputed > 0 ? 'border-l-amber-500' : 'border-l-amber-400'}`}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">
              Pending Release{stats.disputed > 0 ? ` · ${stats.disputed} disputed` : ''}
            </p>
            {formatStat(stats.pendingReleaseUSDC, stats.pendingReleaseSOL).map((line, i) => (
              <p key={i} className={`text-base font-semibold leading-snug ${line === '0' ? 'text-muted-foreground' : 'text-amber-500'}`}>{line}</p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Invoices</p>
            <p className="text-2xl font-semibold text-foreground">{stats.total}</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground">{stats.unpaid} unpaid</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{stats.released} released</span>
              {stats.disputed > 0 && (
                <>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-amber-500">{stats.disputed} disputed</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted flex-wrap h-auto gap-1">
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid ({stats.unpaid})</TabsTrigger>
          <TabsTrigger value="escrow">In Escrow ({stats.inEscrow})</TabsTrigger>
          <TabsTrigger value="released">Released ({stats.released})</TabsTrigger>
          {stats.disputed > 0 && (
            <TabsTrigger value="disputed" className="text-amber-500">
              Disputed ({stats.disputed})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredInvoices.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-base font-semibold text-foreground mb-2">No invoices</h3>
                <p className="text-sm text-muted-foreground mb-4">Create your first invoice to get started.</p>
                <Link to="/create">
                  <Button><Plus className="mr-2 h-4 w-4" />Create Invoice</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((invoice) => {
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
                const installmentsTotal = schedule.length;
                const isDisputed = inv.status === InvoiceStatus.Disputed;
                const releaseRequested = !!inv.completionRequestedAt;
                const releaseReady = isReleaseReady(inv);
                const secondsRemaining = getAutoReleaseSecondsRemaining(inv);
                const canRequestRelease = (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid)
                  && !isDisputed && !releaseRequested && releaseable > 0;

                const borderColor = isDisputed ? 'border-l-amber-500' :
                  inv.status === InvoiceStatus.Unpaid ? 'border-l-orange-400' :
                  inv.status === InvoiceStatus.PartiallyPaid ? 'border-l-blue-400' :
                  inv.status === InvoiceStatus.FullyPaid ? 'border-l-blue-500' :
                  'border-l-green-400';

                return (
                  <Card key={inv.invoiceId} className={`clean-card border-l-4 ${borderColor}`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* ID + Status badges */}
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">{inv.invoiceId}</span>

                            {/* Status badge */}
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              isDisputed ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                              inv.status === InvoiceStatus.Unpaid ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                              inv.status === InvoiceStatus.PartiallyPaid ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              inv.status === InvoiceStatus.FullyPaid ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {isDisputed && <><AlertTriangle className="h-3 w-3" /> Disputed</>}
                              {!isDisputed && inv.status === InvoiceStatus.Unpaid && <><Clock className="h-3 w-3" /> Unpaid</>}
                              {!isDisputed && inv.status === InvoiceStatus.PartiallyPaid && <><Clock className="h-3 w-3" /> Partial</>}
                              {!isDisputed && inv.status === InvoiceStatus.FullyPaid && <><Check className="h-3 w-3" /> Paid</>}
                              {!isDisputed && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" /> Released</>}
                            </span>

                            <Badge className={`text-xs ${inv.tokenType === TokenType.USDC ? 'token-usdc' : 'token-sol'}`}>
                              {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
                            </Badge>
                          </div>

                          {/* Amount */}
                          <p className="text-lg font-semibold text-foreground mb-1">
                            {formatAmount(inv.amount, inv.tokenType)}
                          </p>

                          {inv.description && (
                            <p className="text-xs font-medium text-foreground mb-0.5 truncate">{inv.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {inv.clientEmail} • {formatDate(inv.createdAt)}
                          </p>

                          {/* Installment info */}
                          {hasSchedule && !isDisputed && (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid) && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              Next: {formatAmount(currentInstallmentAmount, inv.tokenType)} ({currentInstallmentBps !== null ? currentInstallmentBps / 100 : 0}%) — installment {scheduleIdx + 1} of {installmentsTotal}
                            </p>
                          )}

                          {/* Dispute notice */}
                          {isDisputed && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              Funds frozen — dispute under review
                            </p>
                          )}

                          {/* Release requested — countdown */}
                          {releaseRequested && !isDisputed && !releaseReady && (
                            <p className="text-xs text-blue-500 mt-1">
                              Release requested · {formatCountdown(secondsRemaining)}
                            </p>
                          )}

                          {/* Release ready */}
                          {releaseRequested && !isDisputed && releaseReady && (
                            <p className="text-xs text-green-500 mt-1">
                              {inv.clientApproved ? 'Client approved — ready to release' : 'Timeout passed — ready to release'}
                            </p>
                          )}

                          {/* Progress bar */}
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

                        {/* Action buttons */}
                        <div className="flex flex-col gap-2 items-end">
                          <Button variant="outline" size="sm" onClick={() => handleCopyLink(inv.invoiceId)}>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy Link
                          </Button>

                          {/* Step 1: Request Release button — before any request is made */}
                          {canRequestRelease && (
                            <div className="flex flex-col items-end gap-1">
                              {hasSchedule && (
                                <div className="flex items-center gap-1">
                                  {schedule.map((_: number, i: number) => (
                                    <span key={i} className={`w-2 h-2 rounded-full ${i < scheduleIdx ? 'bg-green-400' : i === scheduleIdx ? 'bg-amber-400' : 'bg-muted-foreground/30'}`} />
                                  ))}
                                  <span className="text-xs text-muted-foreground ml-1">{scheduleIdx + 1}/{installmentsTotal}</span>
                                </div>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-blue-400 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                                onClick={() => handleRequestRelease(inv)}
                                disabled={requesting === inv.invoiceId}
                              >
                                {requesting === inv.invoiceId ? (
                                  <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Requesting...</>
                                ) : (
                                  <><SendHorizonal className="h-3.5 w-3.5 mr-1" />Request Release</>
                                )}
                              </Button>
                            </div>
                          )}

                          {/* Step 2: Release button — after request made and approved/timeout passed */}
                          {releaseRequested && !isDisputed && releaseReady && releaseable > 0 && (
                            <div className="flex flex-col items-end gap-1">
                              {hasSchedule && (
                                <div className="flex items-center gap-1">
                                  {schedule.map((_: number, i: number) => (
                                    <span key={i} className={`w-2 h-2 rounded-full ${i < scheduleIdx ? 'bg-green-400' : i === scheduleIdx ? 'bg-amber-400' : 'bg-muted-foreground/30'}`} />
                                  ))}
                                  <span className="text-xs text-muted-foreground ml-1">{scheduleIdx + 1}/{installmentsTotal}</span>
                                </div>
                              )}
                              <Button
                                size="sm"
                                className="bg-accent hover:bg-accent/90 text-accent-foreground"
                                onClick={() => openReleaseModal(inv)}
                                disabled={releasing === inv.invoiceId}
                              >
                                <Check className="h-3.5 w-3.5 mr-1" />
                                {hasSchedule
                                  ? `Release ${formatAmount(currentInstallmentAmount, inv.tokenType)}`
                                  : `Release ${formatAmount(releaseable, inv.tokenType)}`
                                }
                              </Button>
                            </div>
                          )}

                          {/* Waiting for client — request sent but not yet approved/timed out */}
                          {releaseRequested && !isDisputed && !releaseReady && (
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-muted text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              Awaiting client
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
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

      {/* Notification History Panel */}
      {showHistory && <NotificationHistory onClose={() => setShowHistory(false)} />}
    </div>
  );
};

export default Dashboard;
