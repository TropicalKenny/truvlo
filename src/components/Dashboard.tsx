import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import { AnchorProvider } from '@coral-xyz/anchor';
import {
  Plus, FileText, Clock, Check, ArrowUpRight, Loader2, Copy,
  RefreshCw, Bell, AlertTriangle, SendHorizonal, ThumbsUp,
  ArrowDownLeft, ExternalLink, Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType } from '@/lib/escrowPaySDK';
import { useToast } from '@/hooks/use-toast';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
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

// ============================================================
// SHARED UI ATOMS
// ============================================================

const StatCard = ({
  label,
  children,
  accentLeft,
}: {
  label: string;
  children: React.ReactNode;
  accentLeft?: string;
}) => (
  <div
    className="rounded-xl p-4 flex flex-col gap-2"
    style={{
      backgroundColor: '#161B22',
      border: '1px solid rgba(255,255,255,0.08)',
      borderLeft: accentLeft ? `4px solid ${accentLeft}` : '1px solid rgba(255,255,255,0.08)',
    }}
  >
    <p
      className="text-xs uppercase tracking-widest"
      style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.07em' }}
    >
      {label}
    </p>
    {children}
  </div>
);

const DarkBadge = ({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: 'orange' | 'blue' | 'green' | 'amber' | 'default';
}) => {
  const styles: Record<string, { bg: string; color: string }> = {
    orange: { bg: 'rgba(249,115,22,0.1)', color: '#FB923C' },
    blue: { bg: 'rgba(59,130,246,0.1)', color: '#93C5FD' },
    green: { bg: 'rgba(34,197,94,0.1)', color: '#4ADE80' },
    amber: { bg: 'rgba(245,158,11,0.1)', color: '#FCD34D' },
    default: { bg: 'rgba(255,255,255,0.06)', color: '#94A3B8' },
  };
  const s = styles[variant] ?? styles.default;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{
        backgroundColor: s.bg,
        color: s.color,
        fontFamily: '"DM Sans", sans-serif',
      }}
    >
      {children}
    </span>
  );
};

// ============================================================
// DASHBOARD
// ============================================================

const Dashboard: React.FC = () => {
  const { connection } = useConnection();
  const { authenticated, getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const privyWallet = wallets[0];
  const publicKey = privyWallet?.address ? new PublicKey(privyWallet.address) : null;
  const connected = authenticated && !!publicKey;
  const { toast } = useToast();
  const { unreadCount, addNotification, markAllAsRead } = useNotifications();

  const [sentInvoices, setSentInvoices] = useState<InvoiceWithKey[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<InvoiceWithKey[]>([]);
  const [clientInvoices, setClientInvoices] = useState<InvoiceWithKey[]>([]);

  const [loading, setLoading] = useState(true);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [disputing, setDisputing] = useState<string | null>(null);

  const [roleTab, setRoleTab] = useState<'sent' | 'received' | 'client'>('sent');
  const [sentFilter, setSentFilter] = useState('all');
  const [receivedFilter, setReceivedFilter] = useState('all');
  const [clientSection, setClientSection] = useState<'action' | 'history'>('action');
  const [notifOpen, setNotifOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  const [releaseModal, setReleaseModal] = useState<{
    open: boolean; invoiceId: string; amount: string;
    tokenType: TokenType; releaseableAmount: number;
  } | null>(null);
  const [profileCopied, setProfileCopied] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleNotifOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open) markAllAsRead();
  };

  const sdk = useMemo(() => {
    if (!publicKey || !privyWallet) return null;
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
    const instance = new EscrowPaySDK(provider);
    if (!instance.isInitialized()) console.error('SDK init error:', instance.getInitError());
    return instance;
  }, [connection, publicKey, privyWallet]);

  const fetchAll = useCallback(async () => {
    if (!sdk || !connected || !sdk.isInitialized()) {
      setSentInvoices([]); setReceivedInvoices([]); setClientInvoices([]); setLoading(false); return;
    }
    setLoading(true);
    try {
      const [creatorResult, clientResult] = await Promise.all([
        sdk.fetchInvoicesByCreator(),
        sdk.fetchInvoicesByClient(),
      ]);

      const sort = (arr: InvoiceWithKey[]) =>
        arr.sort((a, b) => {
          const at = a.account.createdAt.toNumber ? a.account.createdAt.toNumber() : 0;
          const bt = b.account.createdAt.toNumber ? b.account.createdAt.toNumber() : 0;
          return bt - at;
        });

      // Load last-seen state for change-based notifications
      type SeenEntry = { status: number; clientApproved: boolean; disputed: boolean };
      const SEEN_KEY = 'truvlo_seen_invoices';
      let seen: Record<string, SeenEntry> = {};
      try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, SeenEntry>; } catch { /* ignore */ }
      const newSeen: Record<string, SeenEntry> = { ...seen };
      const isFirstLoad = Object.keys(seen).length === 0;

      const checkAndNotify = (invoices: InvoiceWithKey[], role: 'creator' | 'client') => {
        for (const { account: inv } of invoices) {
          const id = inv.invoiceId;
          const prev = seen[id];
          const statusNum = typeof inv.status === 'number' ? inv.status : (inv.status as any)?.valueOf?.() ?? -1;
          const nowDisputed = !!inv.disputeRaisedAt;
          newSeen[id] = { status: statusNum, clientApproved: !!inv.clientApproved, disputed: nowDisputed };
          if (isFirstLoad || !prev) continue;
          // Invoice paid (creator view — someone paid your invoice)
          if (role === 'creator' && prev.status !== InvoiceStatus.FullyPaid && inv.status === InvoiceStatus.FullyPaid) {
            addNotification({ type: 'success', title: 'Invoice paid', message: `#${id}` });
          }
          // Release approved (creator view — client approved release)
          if (role === 'creator' && !prev.clientApproved && !!inv.clientApproved) {
            addNotification({ type: 'success', title: 'Release approved', message: `#${id}` });
          }
          // Dispute raised (either role)
          if (!prev.disputed && nowDisputed) {
            addNotification({ type: 'warning', title: 'Dispute raised', message: `#${id}` });
          }
        }
      };

      if (creatorResult.success && creatorResult.data) {
        const all = sort(creatorResult.data);
        checkAndNotify(all, 'creator');
        setSentInvoices(all);
        setReceivedInvoices(all.filter(i =>
          i.account.status === InvoiceStatus.PartiallyPaid ||
          i.account.status === InvoiceStatus.FullyPaid ||
          i.account.status === InvoiceStatus.Released ||
          i.account.status === InvoiceStatus.Disputed
        ));
      }

      if (clientResult.success && clientResult.data) {
        const sorted = sort(clientResult.data);
        checkAndNotify(sorted, 'client');
        setClientInvoices(sorted);
      }

      try { localStorage.setItem(SEEN_KEY, JSON.stringify(newSeen)); } catch { /* ignore */ }
    } catch {
      setSentInvoices([]); setReceivedInvoices([]); setClientInvoices([]);
    } finally { setLoading(false); }
  }, [sdk, connected, addNotification]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const h = () => fetchAll();
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  }, [fetchAll]);

  useEffect(() => {
    if (!authenticated) return;
    const fetchProfile = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json() as { display_name: string | null };
          setDisplayName(data.display_name);
          if (!data.display_name) setShowNamePrompt(true);
          return;
        }
      } catch { /* non-blocking */ }
      // API unavailable or errored — still show the prompt
      setShowNamePrompt(true);
    };
    fetchProfile();
  }, [authenticated, getAccessToken]);

  const handleSaveName = async () => {
    if (!nameInput.trim()) { setShowNamePrompt(false); return; }
    setSavingName(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: nameInput.trim() }),
      });
      if (res.ok) {
        const data = await res.json() as { display_name: string | null };
        setDisplayName(data.display_name);
        setShowNamePrompt(false);
        toast({ title: 'Name saved' });
      }
    } catch { /* non-blocking */ } finally { setSavingName(false); }
  };

  // ============================================================
  // HELPERS — preserved exactly
  // ============================================================

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
    return lines.length > 0 ? lines : ['—'];
  };

  const getReleaseable = (inv: InvoiceData) => {
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    const released = fromSmallestUnit(inv.amountReleased, inv.tokenType);
    return Math.max(0, paid - released);
  };

  const getSecondsRemaining = (inv: InvoiceData): number => {
    if (!inv.completionRequestedAt) return -1;
    const req = inv.completionRequestedAt.toNumber
      ? inv.completionRequestedAt.toNumber()
      : Number(inv.completionRequestedAt);
    return Math.max(0, 7 * 24 * 60 * 60 - (now - req));
  };

  const isReleaseReady = (inv: InvoiceData) =>
    inv.clientApproved || (!!inv.completionRequestedAt && getSecondsRemaining(inv) === 0);

  const truncateWallet = (pk: string) => `${pk.slice(0, 4)}...${pk.slice(-4)}`;

  // ============================================================
  // CREATOR ACTIONS — preserved exactly
  // ============================================================

  const handleRequestRelease = async (inv: InvoiceData) => {
    if (!sdk || !publicKey) return;
    setRequesting(inv.invoiceId);
    try {
      const result = await sdk.requestRelease(inv.invoiceId, inv.tokenType);
      if (result.success) {
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
              invoiceUrl: `${window.location.origin}/invoice/${inv.invoiceId}/${publicKey.toBase58()}`,
            }),
          });
        } catch { /* non-blocking */ }
        toast({ title: 'Release requested', description: 'Client notified by email.' });
        addNotification({ type: 'info', title: 'Release Requested', message: `7-day window started for ${inv.invoiceId}.` });
        await fetchAll();
      } else {
        toast({ title: 'Request failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Request failed', description: e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
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
        const decimals = releaseModal.tokenType === TokenType.USDC ? 2 : 4;
        const symbol = releaseModal.tokenType === TokenType.USDC ? 'USDC' : 'SOL';
        addNotification({ type: 'success', title: 'Funds Released', message: `Released ${releaseModal.releaseableAmount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol} from ${releaseModal.invoiceId}` });
        await fetchAll();
      } else {
        toast({ title: 'Release failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Release failed', description: e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setReleasing(null); setReleaseModal(null); }
  };

  const handleCopyLink = async (invoiceId: string) => {
    const url = `${window.location.origin}/invoice/${invoiceId}/${publicKey?.toBase58()}`;
    try { await navigator.clipboard.writeText(url); toast({ title: 'Link copied' }); }
    catch { toast({ title: 'Failed to copy', variant: 'destructive' }); }
  };

  // ============================================================
  // CLIENT ACTIONS — preserved exactly
  // ============================================================

  const handleApprove = async (inv: InvoiceData) => {
    if (!sdk) return;
    setApproving(inv.invoiceId);
    try {
      const result = await sdk.approveRelease(inv.invoiceId, inv.creator);
      if (result.success) {
        toast({ title: 'Release approved' });
        addNotification({ type: 'success', title: 'Release Approved', message: `You approved release for ${inv.invoiceId}.` });
        await fetchAll();
      } else {
        toast({ title: 'Approval failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Approval failed', description: e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setApproving(null); }
  };

  const handleDispute = async (inv: InvoiceData) => {
    if (!sdk) return;
    setDisputing(inv.invoiceId);
    try {
      const result = await sdk.raiseDispute(inv.invoiceId, inv.creator);
      if (result.success) {
        toast({ title: 'Dispute raised', description: 'Funds frozen. Mediator will review.' });
        addNotification({ type: 'warning', title: 'Dispute Raised', message: `Dispute opened for ${inv.invoiceId}.` });
        await fetchAll();
      } else {
        toast({ title: 'Dispute failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Dispute failed', description: e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setDisputing(null); }
  };

  // ============================================================
  // STATS — preserved exactly
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
    inEscrow: receivedInvoices.filter(i => i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid).length,
    released: receivedInvoices.filter(i => i.account.status === InvoiceStatus.Released).length,
    disputed: receivedInvoices.filter(i => i.account.status === InvoiceStatus.Disputed).length,
    totalReceivedUSDC: receivedInvoices.filter(i => i.account.tokenType === TokenType.USDC)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.USDC), 0),
    totalReceivedSOL: receivedInvoices.filter(i => i.account.tokenType === TokenType.SOL)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.SOL), 0),
    inEscrowUSDC: receivedInvoices.filter(i => (i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid) && i.account.tokenType === TokenType.USDC)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.USDC) - fromSmallestUnit(i.account.amountReleased, TokenType.USDC), 0),
    inEscrowSOL: receivedInvoices.filter(i => (i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid) && i.account.tokenType === TokenType.SOL)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.SOL) - fromSmallestUnit(i.account.amountReleased, TokenType.SOL), 0),
  };

  const awaitingAction = clientInvoices.filter(i =>
    !!i.account.completionRequestedAt &&
    !i.account.clientApproved &&
    i.account.status !== InvoiceStatus.Disputed &&
    getSecondsRemaining(i.account) > 0
  );
  const paymentHistory = clientInvoices;

  const clientStats = {
    total: clientInvoices.length,
    awaitingAction: awaitingAction.length,
    totalPaidUSDC: clientInvoices.filter(i => i.account.tokenType === TokenType.USDC)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.USDC), 0),
    totalPaidSOL: clientInvoices.filter(i => i.account.tokenType === TokenType.SOL)
      .reduce((s, i) => s + fromSmallestUnit(i.account.amountPaid, TokenType.SOL), 0),
    released: clientInvoices.filter(i => i.account.status === InvoiceStatus.Released).length,
    disputed: clientInvoices.filter(i => i.account.status === InvoiceStatus.Disputed).length,
  };

  const filteredSent = sentFilter === 'all' ? sentInvoices : sentInvoices.filter(i => {
    if (sentFilter === 'unpaid') return i.account.status === InvoiceStatus.Unpaid;
    if (sentFilter === 'escrow') return i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid;
    if (sentFilter === 'released') return i.account.status === InvoiceStatus.Released;
    if (sentFilter === 'disputed') return i.account.status === InvoiceStatus.Disputed;
    return true;
  });

  const filteredReceived = receivedFilter === 'all' ? receivedInvoices : receivedInvoices.filter(i => {
    if (receivedFilter === 'escrow') return i.account.status === InvoiceStatus.PartiallyPaid || i.account.status === InvoiceStatus.FullyPaid;
    if (receivedFilter === 'released') return i.account.status === InvoiceStatus.Released;
    if (receivedFilter === 'disputed') return i.account.status === InvoiceStatus.Disputed;
    return true;
  });

  // ============================================================
  // NOT CONNECTED
  // ============================================================

  if (!connected) {
    return (
      <div
        className="max-w-md mx-auto rounded-xl p-12 text-center"
        style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <FileText className="h-10 w-10 mx-auto mb-4" style={{ color: '#64748B' }} />
        <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>
          Connect to continue — your invoices will appear here.
        </p>
      </div>
    );
  }

  // ============================================================
  // CARD RENDERERS
  // ============================================================

  const borderLeft = (color: string) => `4px solid ${color}`;
  const statusColors: Record<string, string> = {
    amber: '#F59E0B', orange: '#F97316', blue: '#3B82F6', green: '#22C55E', default: 'rgba(255,255,255,0.12)',
  };

  const renderCreatorCard = (invoice: InvoiceWithKey) => {
    const inv = invoice.account;
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    const progressPercent = total > 0 ? (paid / total) * 100 : 0;
    const releaseable = getReleaseable(inv);
    const schedule = inv.releaseSchedule ?? [];
    const scheduleIdx = inv.currentReleaseIndex ?? 0;
    const hasSchedule = schedule.length > 0;
    const currentBps = hasSchedule && scheduleIdx < schedule.length ? schedule[scheduleIdx] : null;
    const currentInstallment = currentBps !== null
      ? parseFloat((paid * currentBps / 10000).toFixed(inv.tokenType === TokenType.USDC ? 2 : 4))
      : releaseable;
    const isDisputed = inv.status === InvoiceStatus.Disputed;
    const releaseRequested = !!inv.completionRequestedAt;
    const releaseReady = isReleaseReady(inv);
    const secondsLeft = getSecondsRemaining(inv);
    const canRequest = (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid)
      && !isDisputed && !releaseRequested && releaseable > 0;

    const leftBorderColor = isDisputed ? statusColors.amber
      : inv.status === InvoiceStatus.Unpaid ? statusColors.orange
      : inv.status === InvoiceStatus.PartiallyPaid ? statusColors.blue
      : inv.status === InvoiceStatus.FullyPaid ? statusColors.blue
      : statusColors.green;

    const badgeVariant: 'amber' | 'orange' | 'blue' | 'green' | 'default' = isDisputed ? 'amber'
      : inv.status === InvoiceStatus.Unpaid ? 'orange'
      : inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid ? 'blue'
      : inv.status === InvoiceStatus.Released ? 'green'
      : 'default';

    return (
      <div
        key={inv.invoiceId}
        className="rounded-xl p-4 transition-colors duration-150"
        style={{
          backgroundColor: '#161B22',
          border: '1px solid rgba(255,255,255,0.08)',
          borderLeft: borderLeft(leftBorderColor),
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1C2128')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#161B22')}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#94A3B8' }}>
                {inv.invoiceId}
              </span>
              <DarkBadge variant={badgeVariant}>
                {isDisputed && <><AlertTriangle className="h-3 w-3" />Disputed</>}
                {!isDisputed && inv.status === InvoiceStatus.Unpaid && <><Clock className="h-3 w-3" />Pending</>}
                {!isDisputed && inv.status === InvoiceStatus.PartiallyPaid && <><Clock className="h-3 w-3" />Partial</>}
                {!isDisputed && inv.status === InvoiceStatus.FullyPaid && <><Check className="h-3 w-3" />In Escrow</>}
                {!isDisputed && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" />Released</>}
              </DarkBadge>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: inv.tokenType === TokenType.USDC ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)',
                  color: inv.tokenType === TokenType.USDC ? '#4ADE80' : '#7DD3FC',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
              </span>
            </div>

            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1.125rem', color: '#F8FAFC', marginBottom: '4px' }}>
              {formatAmount(inv.amount, inv.tokenType)}
            </p>
            {inv.description && (
              <p className="truncate text-sm mb-0.5" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>
                {inv.description}
              </p>
            )}
            <p className="text-xs" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
              {inv.clientEmail} · {formatDate(inv.createdAt)}
            </p>

            {hasSchedule && !isDisputed && (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid) && (
              <p className="text-xs mt-1" style={{ color: '#FCD34D' }}>
                Next: {formatAmount(currentInstallment, inv.tokenType)} ({currentBps !== null ? currentBps / 100 : 0}%) — installment {scheduleIdx + 1} of {schedule.length}
              </p>
            )}
            {isDisputed && <p className="text-xs mt-1" style={{ color: '#FCD34D' }}>Funds frozen — dispute under review</p>}
            {releaseRequested && !isDisputed && !releaseReady && (
              <p className="text-xs mt-1" style={{ color: '#93C5FD' }}>Release requested · {formatCountdown(secondsLeft)}</p>
            )}
            {releaseRequested && !isDisputed && releaseReady && (
              <p className="text-xs mt-1" style={{ color: '#4ADE80' }}>
                {inv.clientApproved ? 'Client approved — ready to release' : 'Timeout passed — ready to release'}
              </p>
            )}

            {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid || isDisputed) && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: '#64748B' }}>
                  <span>Paid: {formatAmount(inv.amountPaid, inv.tokenType)}</span>
                  <span>{progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPercent}%`,
                      backgroundColor: isDisputed ? '#F59E0B' : '#3B82F6',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end flex-shrink-0">
            <button
              onClick={() => handleCopyLink(inv.invoiceId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            >
              <Copy className="h-3.5 w-3.5" />Copy Link
            </button>

            {canRequest && (
              <button
                onClick={() => handleRequestRelease(inv)}
                disabled={requesting === inv.invoiceId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150 disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  color: '#93C5FD',
                  fontFamily: '"DM Sans", sans-serif',
                  cursor: requesting === inv.invoiceId ? 'default' : 'pointer',
                }}
              >
                {requesting === inv.invoiceId
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Requesting...</>
                  : <><SendHorizonal className="h-3.5 w-3.5" />Request Release</>}
              </button>
            )}

            {releaseRequested && !isDisputed && releaseReady && releaseable > 0 && (
              <div className="flex flex-col items-end gap-1">
                {hasSchedule && (
                  <div className="flex items-center gap-1">
                    {schedule.map((_: number, i: number) => (
                      <span
                        key={i}
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: i < scheduleIdx ? '#22C55E' : i === scheduleIdx ? '#F59E0B' : 'rgba(255,255,255,0.15)',
                        }}
                      />
                    ))}
                    <span className="text-xs ml-1" style={{ color: '#64748B' }}>{scheduleIdx + 1}/{schedule.length}</span>
                  </div>
                )}
                <button
                  onClick={() => openReleaseModal(inv)}
                  disabled={releasing === inv.invoiceId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: '#2DD4BF',
                    color: '#0D1117',
                    fontFamily: '"DM Sans", sans-serif',
                    border: 'none',
                    cursor: releasing === inv.invoiceId ? 'default' : 'pointer',
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  {hasSchedule ? `Release ${formatAmount(currentInstallment, inv.tokenType)}` : `Release to Wallet`}
                </button>
              </div>
            )}

            {releaseRequested && !isDisputed && !releaseReady && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  color: '#64748B',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                <Clock className="h-3.5 w-3.5" />Awaiting client
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderClientCard = (invoice: InvoiceWithKey, showActions: boolean) => {
    const inv = invoice.account;
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    const released = fromSmallestUnit(inv.amountReleased, inv.tokenType);
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const progressPercent = total > 0 ? (paid / total) * 100 : 0;
    const schedule = inv.releaseSchedule ?? [];
    const scheduleIdx = inv.currentReleaseIndex ?? 0;
    const isDisputed = inv.status === InvoiceStatus.Disputed;
    const releaseRequested = !!inv.completionRequestedAt;
    const clientApproved = inv.clientApproved ?? false;
    const secondsLeft = getSecondsRemaining(inv);
    const needsAction = releaseRequested && !clientApproved && !isDisputed && secondsLeft > 0;

    const leftBorderColor = isDisputed ? statusColors.amber
      : needsAction ? statusColors.blue
      : inv.status === InvoiceStatus.Released ? statusColors.green
      : statusColors.default;

    const badgeVariant: 'amber' | 'blue' | 'green' | 'default' = isDisputed ? 'amber'
      : needsAction ? 'blue'
      : clientApproved || inv.status === InvoiceStatus.Released ? 'green'
      : 'default';

    return (
      <div
        key={inv.invoiceId}
        className="rounded-xl p-4 transition-colors duration-150"
        style={{
          backgroundColor: '#161B22',
          border: '1px solid rgba(255,255,255,0.08)',
          borderLeft: borderLeft(leftBorderColor),
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1C2128')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#161B22')}
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#94A3B8' }}>
                {inv.invoiceId}
              </span>
              <DarkBadge variant={badgeVariant}>
                {isDisputed && <><AlertTriangle className="h-3 w-3" />Disputed</>}
                {!isDisputed && needsAction && <><Clock className="h-3 w-3" />Action needed</>}
                {!isDisputed && !needsAction && clientApproved && <><Check className="h-3 w-3" />Approved</>}
                {!isDisputed && !needsAction && !clientApproved && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" />Released</>}
                {!isDisputed && !needsAction && !clientApproved && inv.status !== InvoiceStatus.Released && <><Check className="h-3 w-3" />In escrow</>}
              </DarkBadge>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: inv.tokenType === TokenType.USDC ? 'rgba(34,197,94,0.1)' : 'rgba(56,189,248,0.1)',
                  color: inv.tokenType === TokenType.USDC ? '#4ADE80' : '#7DD3FC',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
              </span>
            </div>

            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1.125rem', color: '#F8FAFC', marginBottom: '4px' }}>
              {formatAmount(inv.amount, inv.tokenType)}
            </p>
            {inv.description && (
              <p className="truncate text-sm mb-0.5" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>
                {inv.description}
              </p>
            )}
            <p className="text-xs" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
              To: <span style={{ fontFamily: '"JetBrains Mono", monospace' }}>{truncateWallet(inv.creator.toBase58())}</span> · {formatDate(inv.createdAt)}
            </p>

            {schedule.length > 1 && (
              <p className="text-xs mt-1" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
                Installment {scheduleIdx + 1} of {schedule.length} — {formatAmount(released, inv.tokenType)} released of {formatAmount(paid, inv.tokenType)}
              </p>
            )}
            {isDisputed && <p className="text-xs mt-1" style={{ color: '#FCD34D' }}>Funds frozen — dispute under review</p>}
            {needsAction && <p className="text-xs mt-1" style={{ color: '#93C5FD' }}>Creator requested release · {formatCountdown(secondsLeft)}</p>}
            {clientApproved && !isDisputed && <p className="text-xs mt-1" style={{ color: '#4ADE80' }}>You approved this release</p>}

            {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid || isDisputed) && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: '#64748B' }}>
                  <span>Paid: {formatAmount(inv.amountPaid, inv.tokenType)}</span>
                  <span>{progressPercent.toFixed(0)}%</span>
                </div>
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%`, backgroundColor: isDisputed ? '#F59E0B' : '#3B82F6' }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end flex-shrink-0">
            <button
              onClick={() => window.open(`${window.location.origin}/invoice/${inv.invoiceId}/${inv.creator.toBase58()}`, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            >
              <ExternalLink className="h-3.5 w-3.5" />Open Invoice
            </button>

            {showActions && needsAction && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(inv)}
                  disabled={approving === inv.invoiceId || disputing === inv.invoiceId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
                  style={{
                    backgroundColor: '#22C55E',
                    color: '#0D1117',
                    fontFamily: '"DM Sans", sans-serif',
                    border: 'none',
                    cursor: approving === inv.invoiceId ? 'default' : 'pointer',
                  }}
                >
                  {approving === inv.invoiceId
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Approving...</>
                    : <><ThumbsUp className="h-3.5 w-3.5" />Approve Release</>}
                </button>
                <button
                  onClick={() => handleDispute(inv)}
                  disabled={approving === inv.invoiceId || disputing === inv.invoiceId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-150 disabled:opacity-50"
                  style={{
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(245,158,11,0.3)',
                    color: '#FCD34D',
                    fontFamily: '"DM Sans", sans-serif',
                    cursor: disputing === inv.invoiceId ? 'default' : 'pointer',
                  }}
                >
                  {disputing === inv.invoiceId
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />...</>
                    : <><AlertTriangle className="h-3.5 w-3.5" />Dispute</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const EmptyState = ({ message, showCreate = false }: { message: string; showCreate?: boolean }) => (
    <div
      className="rounded-xl p-12 text-center"
      style={{ border: '1px dashed rgba(255,255,255,0.1)', backgroundColor: 'transparent' }}
    >
      <FileText className="h-8 w-8 mx-auto mb-3" style={{ color: '#64748B' }} />
      <p className="text-sm mb-4" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>{message}</p>
      {showCreate && (
        <Link
          to="/create"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-90"
          style={{ backgroundColor: '#2DD4BF', color: '#0D1117', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
        >
          <Plus className="h-4 w-4" />Create Invoice
        </Link>
      )}
    </div>
  );

  // tab styles
  const tabListStyle: React.CSSProperties = {
    backgroundColor: '#1C2128',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '8px',
    padding: '4px',
  };

  const tabTriggerStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: '"DM Sans", sans-serif',
    fontSize: '13px',
    color: active ? '#F8FAFC' : '#94A3B8',
    backgroundColor: active ? '#161B22' : 'transparent',
    borderRadius: '6px',
    padding: '6px 12px',
    border: active ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  });

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: '1.75rem',
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            {displayName ? `Hey, ${displayName}` : 'Dashboard'}
          </h1>
          {publicKey && (
            <Link
              to={`/profile/${publicKey.toBase58()}`}
              className="flex items-center gap-1 transition-opacity duration-150 hover:opacity-70 w-fit"
              style={{ textDecoration: 'none' }}
              title="View your public escrow record"
            >
              <p
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '12px',
                  color: '#64748B',
                  marginTop: '4px',
                }}
              >
                {truncateWallet(publicKey.toBase58())}
              </p>
              <ExternalLink
                className="h-3 w-3"
                style={{ color: '#64748B', marginTop: '4px' }}
              />
            </Link>
          )}

          {/* First-login display name prompt */}
          {showNamePrompt && (
            <div
              className="flex items-center gap-2 mt-3"
              style={{ flexWrap: 'wrap' }}
            >
              <input
                type="text"
                placeholder="Add a display name…"
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setShowNamePrompt(false); }}
                style={{
                  backgroundColor: '#1C2128',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: '#F8FAFC',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '13px',
                  padding: '6px 12px',
                  outline: 'none',
                  width: '180px',
                }}
              />
              <button
                onClick={handleSaveName}
                disabled={savingName || !nameInput.trim()}
                style={{
                  backgroundColor: '#2DD4BF',
                  color: '#0D1117',
                  border: 'none',
                  borderRadius: '8px',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  opacity: savingName || !nameInput.trim() ? 0.5 : 1,
                }}
              >
                Save
              </button>
              <button
                onClick={() => setShowNamePrompt(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#64748B',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '12px',
                  cursor: 'pointer',
                  padding: '6px 4px',
                }}
              >
                Skip
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <Popover open={notifOpen} onOpenChange={handleNotifOpen}>
            <PopoverTrigger asChild>
              <button
                className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  color: '#94A3B8',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-medium"
                    style={{ backgroundColor: '#2DD4BF', color: '#0D1117' }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}>
              <NotificationList onViewAll={() => { setNotifOpen(false); setShowHistory(true); }} />
            </PopoverContent>
          </Popover>

          {/* Refresh */}
          <button
            onClick={fetchAll}
            disabled={loading}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-150 disabled:opacity-50"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              cursor: loading ? 'default' : 'pointer',
              color: '#94A3B8',
            }}
            onMouseEnter={e => !loading && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Share Profile */}
          {publicKey && (
            <button
              onClick={async () => {
                const url = `${window.location.origin}/profile/${publicKey.toBase58()}`;
                try {
                  await navigator.clipboard.writeText(url);
                  setProfileCopied(true);
                  setTimeout(() => setProfileCopied(false), 2000);
                } catch {
                  toast({ title: 'Failed to copy', variant: 'destructive' });
                }
              }}
              className="flex items-center gap-1.5 px-3 h-9 rounded-lg text-xs font-medium transition-all duration-150"
              style={{
                backgroundColor: profileCopied ? 'rgba(45,212,191,0.1)' : 'transparent',
                border: profileCopied ? '1px solid rgba(45,212,191,0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: profileCopied ? '#2DD4BF' : '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!profileCopied) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { if (!profileCopied) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              title="Copy your public profile link"
            >
              {profileCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {profileCopied ? 'Copied!' : 'Profile'}
            </button>
          )}

          {/* Create invoice */}
          <Link
            to="/create"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: '#2DD4BF',
              color: '#0D1117',
              fontFamily: '"DM Sans", sans-serif',
              textDecoration: 'none',
            }}
          >
            <Plus className="h-4 w-4" />Create Invoice
          </Link>
        </div>
      </div>

      {/* Role tabs */}
      <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as 'sent' | 'received' | 'client')}>
        <TabsList style={tabListStyle}>
          <TabsTrigger value="sent" style={tabTriggerStyle(roleTab === 'sent')} className="flex items-center gap-1.5">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Sent ({sentStats.total})
          </TabsTrigger>
          <TabsTrigger value="received" style={tabTriggerStyle(roleTab === 'received')} className="flex items-center gap-1.5">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Received ({receivedStats.total})
          </TabsTrigger>
          <TabsTrigger value="client" style={tabTriggerStyle(roleTab === 'client')} className="flex items-center gap-1.5 relative">
            <Wallet className="h-3.5 w-3.5" />
            Client ({clientStats.total})
            {clientStats.awaitingAction > 0 && (
              <span
                className="ml-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-medium"
                style={{ backgroundColor: '#3B82F6', color: '#fff' }}
              >
                {clientStats.awaitingAction}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ======= SENT TAB ======= */}
        <TabsContent value="sent" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Pending Release" accentLeft={sentStats.pendingReleaseUSDC > 0 || sentStats.pendingReleaseSOL > 0 ? '#F59E0B' : undefined}>
              {formatStat(sentStats.pendingReleaseUSDC, sentStats.pendingReleaseSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '—' ? '#64748B' : '#FCD34D', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="In Escrow" accentLeft={sentStats.inEscrow > 0 ? '#3B82F6' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: sentStats.inEscrow > 0 ? '#93C5FD' : '#64748B' }}>{sentStats.inEscrow}</p>
            </StatCard>
            <StatCard label="Released" accentLeft={sentStats.released > 0 ? '#22C55E' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: sentStats.released > 0 ? '#4ADE80' : '#64748B' }}>{sentStats.released}</p>
            </StatCard>
            <StatCard label="Total Invoices">
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: '#F8FAFC' }}>{sentStats.total}</p>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>{sentStats.unpaid} pending</span>
                {sentStats.disputed > 0 && <span className="text-xs" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>· {sentStats.disputed} disputed</span>}
              </div>
            </StatCard>
          </div>

          {/* Sub-filter tabs */}
          <Tabs value={sentFilter} onValueChange={setSentFilter}>
            <TabsList style={tabListStyle}>
              <TabsTrigger value="all" style={tabTriggerStyle(sentFilter === 'all')}>All ({sentStats.total})</TabsTrigger>
              <TabsTrigger value="unpaid" style={tabTriggerStyle(sentFilter === 'unpaid')}>Pending ({sentStats.unpaid})</TabsTrigger>
              <TabsTrigger value="escrow" style={tabTriggerStyle(sentFilter === 'escrow')}>In Escrow ({sentStats.inEscrow})</TabsTrigger>
              <TabsTrigger value="released" style={tabTriggerStyle(sentFilter === 'released')}>Released ({sentStats.released})</TabsTrigger>
              {sentStats.disputed > 0 && <TabsTrigger value="disputed" style={tabTriggerStyle(sentFilter === 'disputed')}>Disputed ({sentStats.disputed})</TabsTrigger>}
            </TabsList>
            <TabsContent value={sentFilter} className="mt-3">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#2DD4BF' }} /></div>
              ) : filteredSent.length === 0 ? (
                <EmptyState message="No invoices yet." showCreate />
              ) : (
                <div className="space-y-3">{filteredSent.map(renderCreatorCard)}</div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ======= RECEIVED TAB ======= */}
        <TabsContent value="received" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Received">
              {formatStat(receivedStats.totalReceivedUSDC, receivedStats.totalReceivedSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '—' ? '#64748B' : '#F8FAFC', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="In Escrow" accentLeft={receivedStats.inEscrow > 0 ? '#3B82F6' : undefined}>
              {formatStat(receivedStats.inEscrowUSDC, receivedStats.inEscrowSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '—' ? '#64748B' : '#93C5FD', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="Released" accentLeft={receivedStats.released > 0 ? '#22C55E' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: receivedStats.released > 0 ? '#4ADE80' : '#64748B' }}>{receivedStats.released}</p>
            </StatCard>
            <StatCard label="Invoices Paid">
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: '#F8FAFC' }}>{receivedStats.total}</p>
              {receivedStats.disputed > 0 && <p className="text-xs" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>{receivedStats.disputed} disputed</p>}
            </StatCard>
          </div>

          <Tabs value={receivedFilter} onValueChange={setReceivedFilter}>
            <TabsList style={tabListStyle}>
              <TabsTrigger value="all" style={tabTriggerStyle(receivedFilter === 'all')}>All ({receivedStats.total})</TabsTrigger>
              <TabsTrigger value="escrow" style={tabTriggerStyle(receivedFilter === 'escrow')}>In Escrow ({receivedStats.inEscrow})</TabsTrigger>
              <TabsTrigger value="released" style={tabTriggerStyle(receivedFilter === 'released')}>Released ({receivedStats.released})</TabsTrigger>
              {receivedStats.disputed > 0 && <TabsTrigger value="disputed" style={tabTriggerStyle(receivedFilter === 'disputed')}>Disputed ({receivedStats.disputed})</TabsTrigger>}
            </TabsList>
            <TabsContent value={receivedFilter} className="mt-3">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#2DD4BF' }} /></div>
              ) : filteredReceived.length === 0 ? (
                <EmptyState message="No paid invoices yet. Once a client pays, it appears here." />
              ) : (
                <div className="space-y-3">{filteredReceived.map(renderCreatorCard)}</div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ======= CLIENT TAB ======= */}
        <TabsContent value="client" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Paid Out">
              {formatStat(clientStats.totalPaidUSDC, clientStats.totalPaidSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '—' ? '#64748B' : '#F8FAFC', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="Awaiting Action" accentLeft={clientStats.awaitingAction > 0 ? '#3B82F6' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: clientStats.awaitingAction > 0 ? '#93C5FD' : '#64748B' }}>{clientStats.awaitingAction}</p>
            </StatCard>
            <StatCard label="Released" accentLeft={clientStats.released > 0 ? '#22C55E' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: clientStats.released > 0 ? '#4ADE80' : '#64748B' }}>{clientStats.released}</p>
            </StatCard>
            <StatCard label="Invoices Paid">
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: '#F8FAFC' }}>{clientStats.total}</p>
              {clientStats.disputed > 0 && <p className="text-xs" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>{clientStats.disputed} disputed</p>}
            </StatCard>
          </div>

          {/* Section toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setClientSection('action')}
              className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: clientSection === 'action' ? '#161B22' : 'transparent',
                border: clientSection === 'action' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
                color: clientSection === 'action' ? '#F8FAFC' : '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
              }}
            >
              Awaiting Approval
              {clientStats.awaitingAction > 0 && (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium"
                  style={{ backgroundColor: '#3B82F6', color: '#fff' }}
                >
                  {clientStats.awaitingAction}
                </span>
              )}
            </button>
            <button
              onClick={() => setClientSection('history')}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: clientSection === 'history' ? '#161B22' : 'transparent',
                border: clientSection === 'history' ? '1px solid rgba(255,255,255,0.12)' : '1px solid rgba(255,255,255,0.06)',
                color: clientSection === 'history' ? '#F8FAFC' : '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
              }}
            >
              Payment History ({clientStats.total})
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#2DD4BF' }} /></div>
          ) : clientSection === 'action' ? (
            awaitingAction.length === 0 ? (
              <EmptyState message="No invoices awaiting your approval right now." />
            ) : (
              <div className="space-y-3">{awaitingAction.map(i => renderClientCard(i, true))}</div>
            )
          ) : (
            paymentHistory.length === 0 ? (
              <EmptyState message="No payment history yet. Invoices you pay will appear here." />
            ) : (
              <div className="space-y-3">{paymentHistory.map(i => renderClientCard(i, false))}</div>
            )
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

      {showHistory && <NotificationHistory onClose={() => setShowHistory(false)} />}
    </div>
  );
};

export default Dashboard;
