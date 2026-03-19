import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { 
  Plus, 
  FileText, 
  Clock, 
  Check,
  ArrowUpRight,
  Loader2,
  Copy,
  RefreshCw,
  Bell
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
import { NotificationList, useNotifications } from './NotificationProvider';

interface InvoiceWithKey {
  publicKey: PublicKey;
  account: InvoiceData;
}

const Dashboard: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions, connected } = useWallet();
  const { toast } = useToast();
  const { notifications, addNotification, clearAll } = useNotifications();
  
  const [invoices, setInvoices] = useState<InvoiceWithKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [releaseModal, setReleaseModal] = useState<{
    open: boolean;
    invoiceId: string;
    amount: string;
    tokenType: TokenType;
    releaseableAmount: number;
  } | null>(null);

  // Track unread count — increments when new notifications arrive while popover is closed
  useEffect(() => {
    if (!notifOpen) {
      setUnreadCount(notifications.length);
    }
  }, [notifications.length, notifOpen]);

  // When popover opens, mark all as read (clear badge)
  const handleNotifOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open) {
      setUnreadCount(0);
    }
  };

  const sdk = useMemo(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) return null;
    const provider = new AnchorProvider(
      connection,
      { publicKey, signTransaction, signAllTransactions },
      { commitment: 'confirmed' }
    );
    const instance = new EscrowPaySDK(provider);
    if (!instance.isInitialized()) {
      console.error('SDK failed to initialize:', instance.getInitError());
    }
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

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Auto-refresh when window regains focus
  useEffect(() => {
    const handleFocus = () => { fetchInvoices(); };
    window.addEventListener('focus', handleFocus);
    return () => { window.removeEventListener('focus', handleFocus); };
  }, [fetchInvoices]);

  const fromSmallestUnit = (amount: any, tokenType: TokenType) => {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      const val = amount.toNumber ? amount.toNumber() : Number(amount);
      return val / Math.pow(10, decimals);
    } catch {
      return 0;
    }
  };

  // FIX: formatAmount only calls fromSmallestUnit for BN/raw chain values.
  // For plain numbers (already human-readable), use directly.
  const formatAmount = (amount: any, tokenType: TokenType): string => {
    const symbol = tokenType === TokenType.USDC ? 'USDC' : 'SOL';
    const decimals = tokenType === TokenType.USDC ? 2 : 4;
    // If it's a plain JS number (already converted), use it directly
    const value = (typeof amount === 'number') 
      ? amount 
      : fromSmallestUnit(amount, tokenType);
    return `${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol}`;
  };

  const formatDate = (timestamp: any): string => {
    try {
      const ts = timestamp.toNumber ? timestamp.toNumber() : Number(timestamp);
      return new Date(ts * 1000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '-';
    }
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

  const openReleaseModal = (invoice: InvoiceData) => {
    const releaseableAmount = getReleaseable(invoice);
    setReleaseModal({
      open: true,
      invoiceId: invoice.invoiceId,
      amount: formatAmount(invoice.amountPaid, invoice.tokenType),
      tokenType: invoice.tokenType,
      releaseableAmount,
    });
  };

  const handleReleaseFunds = async () => {
    if (!sdk || !releaseModal) return;
    
    setReleasing(releaseModal.invoiceId);
    try {
      const result = await sdk.releaseFunds(
        releaseModal.invoiceId,
        releaseModal.releaseableAmount,
        releaseModal.tokenType
      );
      
      if (result.success) {
        toast({ title: 'Funds released' });
        // FIX: releaseableAmount is already a plain number — format it directly, don't run through fromSmallestUnit again
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
      let msg = 'Transaction failed.';
      const errorStr = error instanceof Error ? error.message : String(error || '');
      if (errorStr.includes('User rejected') || errorStr.includes('rejected the request')) {
        msg = 'Transaction cancelled.';
      }
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

  // Stats
  const stats = {
    total: invoices.length,
    unpaid: invoices.filter(i => i.account.status === InvoiceStatus.Unpaid).length,
    inEscrow: invoices.filter(i => i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid).length,
    released: invoices.filter(i => i.account.status === InvoiceStatus.Released).length,
    // Total ever received (amountPaid across all invoices)
    totalReceivedUSDC: invoices
      .filter(i => i.account.tokenType === TokenType.USDC)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.USDC), 0),
    totalReceivedSOL: invoices
      .filter(i => i.account.tokenType === TokenType.SOL)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.SOL), 0),
    // Currently in escrow (paid but not yet released)
    inEscrowUSDC: invoices
      .filter(i => (i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid) && i.account.tokenType === TokenType.USDC)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.USDC) - fromSmallestUnit(i.account.amountReleased, TokenType.USDC), 0),
    inEscrowSOL: invoices
      .filter(i => (i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid) && i.account.tokenType === TokenType.SOL)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.SOL) - fromSmallestUnit(i.account.amountReleased, TokenType.SOL), 0),
    // Pending release = same as inEscrow (fully paid invoices only — actionable)
    pendingReleaseUSDC: invoices
      .filter(i => i.account.status === InvoiceStatus.FullyPaid && i.account.tokenType === TokenType.USDC)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.USDC) - fromSmallestUnit(i.account.amountReleased, TokenType.USDC), 0),
    pendingReleaseSOL: invoices
      .filter(i => i.account.status === InvoiceStatus.FullyPaid && i.account.tokenType === TokenType.SOL)
      .reduce((sum, i) => sum + fromSmallestUnit(i.account.amountPaid, TokenType.SOL) - fromSmallestUnit(i.account.amountReleased, TokenType.SOL), 0),
  };

  const filteredInvoices = activeTab === 'all' 
    ? invoices 
    : invoices.filter(i => {
        if (activeTab === 'unpaid') return i.account.status === InvoiceStatus.Unpaid;
        if (activeTab === 'escrow') return i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid;
        if (activeTab === 'released') return i.account.status === InvoiceStatus.Released;
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
          {/* Notifications */}
          <Popover open={notifOpen} onOpenChange={handleNotifOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                {/* FIX: badge shows unread count, clears when popover opens */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <NotificationList />
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
        {/* Total Received */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Total Received</p>
            {formatStat(stats.totalReceivedUSDC, stats.totalReceivedSOL).map((line, i) => (
              <p key={i} className="text-base font-semibold text-foreground leading-snug">{line}</p>
            ))}
          </CardContent>
        </Card>
        {/* In Escrow */}
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">In Escrow</p>
            {formatStat(stats.inEscrowUSDC, stats.inEscrowSOL).map((line, i) => (
              <p key={i} className={`text-base font-semibold leading-snug ${line === '0' ? 'text-muted-foreground' : 'text-blue-500'}`}>{line}</p>
            ))}
          </CardContent>
        </Card>
        {/* Pending Release */}
        <Card className="border-l-4 border-l-amber-400">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Pending Release</p>
            {formatStat(stats.pendingReleaseUSDC, stats.pendingReleaseSOL).map((line, i) => (
              <p key={i} className={`text-base font-semibold leading-snug ${line === '0' ? 'text-muted-foreground' : 'text-amber-500'}`}>{line}</p>
            ))}
          </CardContent>
        </Card>
        {/* Invoice counts */}
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Invoices</p>
            <p className="text-2xl font-semibold text-foreground">{stats.total}</p>
            <div className="flex gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{stats.unpaid} unpaid</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{stats.released} released</span>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Invoices */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted">
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="unpaid">Unpaid ({stats.unpaid})</TabsTrigger>
          <TabsTrigger value="escrow">In Escrow ({stats.inEscrow})</TabsTrigger>
          <TabsTrigger value="released">Released ({stats.released})</TabsTrigger>
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
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Invoice
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((invoice) => {
                const inv = invoice.account;
                const total = fromSmallestUnit(inv.amount, inv.tokenType);
                const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
                const released = fromSmallestUnit(inv.amountReleased, inv.tokenType);
                const progressPercent = total > 0 ? (paid / total) * 100 : 0;
                const releaseable = getReleaseable(inv);
                
                return (
                  <Card key={inv.invoiceId} className={`clean-card border-l-4 ${
                    inv.status === InvoiceStatus.Unpaid ? 'border-l-orange-400' :
                    inv.status === InvoiceStatus.PartiallyPaid ? 'border-l-blue-400' :
                    inv.status === InvoiceStatus.FullyPaid ? 'border-l-blue-500' :
                    'border-l-green-400'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-xs text-muted-foreground">{inv.invoiceId}</span>
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                              inv.status === InvoiceStatus.Unpaid ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                              inv.status === InvoiceStatus.PartiallyPaid ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              inv.status === InvoiceStatus.FullyPaid ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {inv.status === InvoiceStatus.Unpaid && <><Clock className="h-3 w-3" /> Unpaid</>}
                              {inv.status === InvoiceStatus.PartiallyPaid && <><Clock className="h-3 w-3" /> Partial</>}
                              {inv.status === InvoiceStatus.FullyPaid && <><Check className="h-3 w-3" /> Paid</>}
                              {inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" /> Released</>}
                            </span>
                            <Badge className={`text-xs ${inv.tokenType === TokenType.USDC ? 'token-usdc' : 'token-sol'}`}>
                              {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
                            </Badge>
                          </div>
                          
                          <p className="text-lg font-semibold text-foreground mb-1">
                            {formatAmount(inv.amount, inv.tokenType)}
                          </p>
                          
                          <p className="text-xs text-muted-foreground">
                            {inv.clientEmail} • {formatDate(inv.createdAt)}
                          </p>
                          
                          {/* Progress bar for partial/paid */}
                          {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid) && (
                            <div className="mt-2">
                              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                <span>Paid: {formatAmount(inv.amountPaid, inv.tokenType)}</span>
                                <span>{progressPercent.toFixed(0)}%</span>
                              </div>
                              <div className="progress-bar h-1.5">
                                <div className="progress-bar-fill h-full" style={{ width: `${progressPercent}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleCopyLink(inv.invoiceId)}>
                            <Copy className="h-3.5 w-3.5 mr-1" />
                            Copy Link
                          </Button>
                          
                          {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid) && releaseable > 0 && (
                            <Button
                              size="sm"
                              className="bg-accent hover:bg-accent/90 text-accent-foreground"
                              onClick={() => openReleaseModal(inv)}
                            >
                              <Check className="h-3.5 w-3.5 mr-1" />
                              Release
                            </Button>
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
    </div>
  );
};

export default Dashboard;
