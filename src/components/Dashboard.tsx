import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { useAuthProfile } from '@/contexts/AuthProfileContext';
import { AnchorProvider } from '@coral-xyz/anchor';
import {
  Plus, FileText, Clock, Check, ArrowUpRight, Loader2, Copy,
  RefreshCw, Bell, AlertTriangle, SendHorizonal, ThumbsUp,
  ArrowDownLeft, ExternalLink, Wallet as WalletIcon, Bot
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType } from '@/lib/escrowPaySDK';
import { createPrivySolanaAnchorWallet } from '@/lib/privySolanaAnchorWallet';
import { sendSponsoredSolanaTransaction } from '@/lib/privySponsoredSolana';
import { formatTokenAmount } from '@/lib/amountFormat';
import { useToast } from '@/hooks/use-toast';
import { PublicKey } from '@solana/web3.js';
import ReleaseModal from './ReleaseModal';
import { NotificationList, NotificationHistory, useNotifications } from './NotificationProvider';

interface InvoiceWithKey {
  publicKey: PublicKey;
  account: InvoiceData;
}

interface ClientInvoiceMeta {
  sender_name: string | null;
}

interface AgentVerificationMeta {
  verification_status: 'pending' | 'passed' | 'failed' | 'needs_human_review';
  confidence: 'low' | 'medium' | 'high';
  summary?: string | null;
  risks?: string | null;
  recommended_action?: 'approve' | 'dispute' | 'manual_review';
  verifier_type?: 'rule' | 'ai' | 'manual';
}

type AmountLike =

  | number
  | string
  | bigint
  | { toNumber?: () => number; toString?: () => string }
  | null
  | undefined;

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
    className="trust-dashboard-stat rounded-lg p-4 flex flex-col gap-2"
    style={{
      backgroundColor: 'rgba(17,24,32,0.86)',
      border: '1px solid var(--tl-border)',
      borderLeft: accentLeft ? `3px solid ${accentLeft}` : '1px solid var(--tl-border)',
    }}
  >
    <p
      className="text-xs uppercase tracking-widest"
      style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.08em' }}
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
      className="trust-status"
      style={{
        backgroundColor: s.bg,
        color: s.color,
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
  const { profile } = useAuthProfile();
  const { activeWallet: privyWallet, allWallets } = useActiveWallet();
  const privyWalletRef = useRef(privyWallet);
  privyWalletRef.current = privyWallet;
  const walletAddress = privyWallet?.address ?? null;
  const publicKey = useMemo(() => walletAddress ? new PublicKey(walletAddress) : null, [walletAddress]);
  const connected = authenticated && !!publicKey;
  const { toast } = useToast();
  const { unreadCount, addNotification, markAllAsRead } = useNotifications();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const addNotificationRef = useRef(addNotification);
  addNotificationRef.current = addNotification;

  const [sentInvoices, setSentInvoices] = useState<InvoiceWithKey[]>([]);
  const [receivedInvoices, setReceivedInvoices] = useState<InvoiceWithKey[]>([]);
  const [clientInvoices, setClientInvoices] = useState<InvoiceWithKey[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedOnce = useRef(false);
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
    tokenType: TokenType; releaseableAmount: number; isFinalRelease: boolean;
    creatorWallet: string; clientWallet: string | null;
  } | null>(null);
  const lastFetchedAt = useRef<number>(0);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const displayName = profile?.display_name ?? null;
  const [clientInvoiceMeta, setClientInvoiceMeta] = useState<Record<string, ClientInvoiceMeta>>({});
  const [agentVerificationMeta, setAgentVerificationMeta] = useState<Record<string, AgentVerificationMeta | null>>({});
  const [proofModal, setProofModal] = useState<{
    invoiceId: string;
    creatorWallet: string;
    deliverableUrl: string;
    proofText: string;
  } | null>(null);
  const [submittingProof, setSubmittingProof] = useState<string | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60000);
    return () => clearInterval(interval);
  }, []);

  const handleNotifOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open) markAllAsRead();
  };

  const sdk = useMemo(() => {
    if (!publicKey || !walletAddress) return null;
    const anchorWallet = createPrivySolanaAnchorWallet(() => privyWalletRef.current, publicKey);
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
    const sponsorFn = async (tx: Uint8Array): Promise<string> => {
      const wallet = privyWalletRef.current;
      if (!wallet) throw new Error('Wallet disconnected');
      return sendSponsoredSolanaTransaction(signAndSendTransaction, wallet, tx);
    };
    const instance = new EscrowPaySDK(provider, false, sponsorFn);
    if (!instance.isInitialized()) console.error('SDK init error:', instance.getInitError());
    return instance;
  }, [connection, publicKey, signAndSendTransaction, walletAddress]);

  const isFetching = useRef(false);

  const fetchAll = useCallback(async (showRefreshSpinner = false) => {
    if (isFetching.current) return;
    if (showRefreshSpinner) setRefreshing(true);
    if (!sdk || !connected || !sdk.isInitialized()) {
      setSentInvoices([]); setReceivedInvoices([]); setClientInvoices([]);
      setLoading(false);
      if (showRefreshSpinner) setRefreshing(false);
      return;
    }
    isFetching.current = true;
    setLoading(true);
    setFetchError(null);
    try {
      const fetchTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10_000)
      );
      const [creatorResult, clientResult] = await Promise.race([
        Promise.all([sdk.fetchInvoicesByCreator(), sdk.fetchInvoicesByClient()]),
        fetchTimeout,
      ]) as [Awaited<ReturnType<typeof sdk.fetchInvoicesByCreator>>, Awaited<ReturnType<typeof sdk.fetchInvoicesByClient>>];

      const sort = (arr: InvoiceWithKey[]) =>
        arr.sort((a, b) => {
          const at = a.account.createdAt.toNumber ? a.account.createdAt.toNumber() : 0;
          const bt = b.account.createdAt.toNumber ? b.account.createdAt.toNumber() : 0;
          return bt - at;
        });

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
          const statusNum = (() => {
            if (typeof inv.status === 'number' && Number.isFinite(inv.status)) return inv.status;
            if (inv.status && typeof inv.status === 'object' && typeof (inv.status as { valueOf?: () => unknown }).valueOf === 'function') {
              const value = (inv.status as { valueOf?: () => unknown }).valueOf?.();
              return typeof value === 'number' ? value : Number(value ?? -1);
            }
            return -1;
          })();
          const nowDisputed = !!inv.disputeRaisedAt;
          newSeen[id] = { status: statusNum, clientApproved: !!inv.clientApproved, disputed: nowDisputed };
          if (isFirstLoad || !prev) continue;
          if (role === 'creator' && prev.status !== InvoiceStatus.FullyPaid && inv.status === InvoiceStatus.FullyPaid) {
            addNotificationRef.current({ type: 'success', title: 'Invoice paid', message: `#${id}` });
          }
          if (role === 'creator' && !prev.clientApproved && !!inv.clientApproved) {
            addNotificationRef.current({ type: 'success', title: 'Withdrawal approved', message: `#${id}` });
          }
          if (!prev.disputed && nowDisputed) {
            addNotificationRef.current({ type: 'warning', title: 'Dispute raised', message: `#${id}` });
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
    } catch (e) {
      const isTimeout = e instanceof Error && e.message === 'timeout';
      setFetchError(isTimeout
        ? 'Could not reach Solana - check your connection and try refreshing.'
        : 'Failed to load invoices. Try refreshing.'
      );
      setSentInvoices([]); setReceivedInvoices([]); setClientInvoices([]);
    } finally {
      isFetching.current = false;
      setLoading(false);
      hasLoadedOnce.current = true;
      lastFetchedAt.current = Date.now();
      if (showRefreshSpinner) setRefreshing(false);
    }
  }, [sdk, connected]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const h = () => {
      if (Date.now() - lastFetchedAt.current > 30_000) void fetchAll();
    };
    window.addEventListener('focus', h);
    return () => window.removeEventListener('focus', h);
  }, [fetchAll]);

  const loadClientInvoiceMeta = useCallback(async (invoices: InvoiceWithKey[]) => {
    const missing = invoices.filter(({ account: inv }) => {
      const key = `${inv.invoiceId}:${inv.creator.toBase58()}`;
      return !(key in clientInvoiceMeta);
    });
    if (missing.length === 0) return;

    const loadedEntries = await Promise.all(missing.map(async ({ account: inv }) => {
      const creatorWallet = inv.creator.toBase58();
      const key = `${inv.invoiceId}:${creatorWallet}`;
      try {
        const params = new URLSearchParams({ invoiceId: inv.invoiceId, creatorWallet });
        const res = await fetch(`/api/create-invoice-meta?${params.toString()}`);
        if (!res.ok) return [key, { sender_name: null }] as const;
        const data = await res.json() as { sender_name?: string | null };
        return [key, { sender_name: data.sender_name?.trim() || null }] as const;
      } catch {
        return [key, { sender_name: null }] as const;
      }
    }));

    setClientInvoiceMeta(prev => ({ ...prev, ...Object.fromEntries(loadedEntries) }));
  }, [clientInvoiceMeta]);

  useEffect(() => {
    if (clientInvoices.length === 0) return;
    void loadClientInvoiceMeta(clientInvoices);
  }, [clientInvoices, loadClientInvoiceMeta]);

  const loadAgentVerificationMeta = useCallback(async (invoices: InvoiceWithKey[]) => {
    const missing = invoices.filter(({ account: inv }) => {
      const key = `${inv.invoiceId}:${inv.creator.toBase58()}`;
      return !(key in agentVerificationMeta);
    });
    if (missing.length === 0) return;

    const loadedEntries = await Promise.all(missing.map(async ({ account: inv }) => {
      const creatorWallet = inv.creator.toBase58();
      const key = `${inv.invoiceId}:${creatorWallet}`;
      try {
        const params = new URLSearchParams({ invoiceId: inv.invoiceId, creatorWallet });
        const res = await fetch(`/api/agent-verifications?${params.toString()}`);
        if (!res.ok) return [key, null] as const;
        const data = await res.json() as { agent_verification?: AgentVerificationMeta | null };
        return [key, data.agent_verification ?? null] as const;
      } catch {
        return [key, null] as const;
      }
    }));

    setAgentVerificationMeta(prev => ({ ...prev, ...Object.fromEntries(loadedEntries) }));
  }, [agentVerificationMeta]);

  useEffect(() => {
    const invoices = [...sentInvoices, ...clientInvoices];
    if (invoices.length === 0) return;
    void loadAgentVerificationMeta(invoices);
  }, [sentInvoices, clientInvoices, loadAgentVerificationMeta]);

  // ============================================================
  // HELPERS
  // ============================================================

  const fromSmallestUnit = (amount: AmountLike, tokenType: TokenType) => {
    const decimals = tokenType === TokenType.USDC ? 6 : 9;
    try {
      // FIX: Properly narrow the union type instead of accessing .toNumber directly,
      // which TypeScript rejects because string/number/bigint don't have that property.
      const raw = (amount != null && typeof amount === 'object' && typeof amount.toNumber === 'function')
        ? amount.toNumber()
        : Number(amount ?? 0);
      const int = BigInt(Math.round(raw));
      const divisor = BigInt(10 ** decimals);
      const whole = int / divisor;
      const remainder = int % divisor;
      return parseFloat(`${whole}.${remainder.toString().padStart(decimals, '0')}`);
    } catch { return 0; }
  };

  const formatAmount = (amount: AmountLike, tokenType: TokenType): string => {
    const value = typeof amount === 'number' ? amount : fromSmallestUnit(amount, tokenType);
    return formatTokenAmount(value, tokenType);
  };

  const formatDate = (timestamp: AmountLike): string => {
    try {
      // FIX 1: Guard against null/undefined before any property access.
      // FIX 2: Narrow the type before calling .toNumber() to satisfy TypeScript,
      // because string/number/bigint members of AmountLike don't have .toNumber.
      if (timestamp == null) return '-';
      const ts = (typeof timestamp === 'object' && typeof timestamp.toNumber === 'function')
        ? timestamp.toNumber()
        : Number(timestamp);
      return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return '-'; }
  };

  const formatStat = (usdc: number, sol: number) => {
    const lines = [];
    if (usdc > 0) lines.push(formatTokenAmount(usdc, TokenType.USDC));
    if (sol > 0) lines.push(formatTokenAmount(sol, TokenType.SOL));
    return lines.length > 0 ? lines : ['-'];
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
  // CREATOR ACTIONS
  // ============================================================

  const handleRequestRelease = async (inv: InvoiceData) => {
    if (!sdk || !publicKey) return;
    setRequesting(inv.invoiceId);
    try {
      const result = await sdk.requestRelease(inv.invoiceId, inv.tokenType);
      if (result.success) {
        try {
          const token = await getAccessToken();
          const notifyRes = await fetch('/api/notify-client', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              invoiceId: inv.invoiceId,
              creatorWallet: publicKey!.toBase58(),
              amount: formatAmount(inv.amountPaid, inv.tokenType),
              senderName: displayName || undefined,
              invoiceUrl: `${window.location.origin}/invoice/${inv.invoiceId}/${publicKey!.toBase58()}`,
            }),
          });
          if (notifyRes.ok) {
            toast({ title: 'Withdrawal requested', description: 'Client notified by email.' });
          } else {
            let notifyError = 'Email notification failed. Copy the invoice link if needed.';
            try {
              const body = await notifyRes.json() as { error?: string };
              if (body.error) notifyError = `${body.error}. Copy the invoice link if needed.`;
            } catch { /* keep fallback */ }
            toast({ title: 'Withdrawal requested', description: notifyError, variant: 'destructive' });
          }
        } catch {
          toast({ title: 'Withdrawal requested', description: 'Email notification failed. Copy the invoice link if needed.', variant: 'destructive' });
        }
        addNotification({ type: 'info', title: 'Withdrawal Requested', message: `7-day window started for ${inv.invoiceId}.` });
        lastFetchedAt.current = 0; await fetchAll();
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
    const isFinalRelease = schedule.length === 0 || idx >= schedule.length - 1;
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
      isFinalRelease,
      creatorWallet: publicKey?.toBase58() || '',
      clientWallet: invoice.client?.toBase58() ?? null,
    });
  };

  const handleReleaseFunds = async () => {
    if (!sdk || !releaseModal) return;
    setReleasing(releaseModal.invoiceId);
    try {
      const result = await sdk.releaseFunds(releaseModal.invoiceId, releaseModal.releaseableAmount, releaseModal.tokenType);
      if (result.success) {
        toast({ title: 'Funds withdrawn to wallet' });
        if (releaseModal.isFinalRelease && releaseModal.clientWallet) {
          try {
            const token = await getAccessToken();
            await fetch('/api/referrals', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                invoiceId: releaseModal.invoiceId,
                creatorWallet: releaseModal.creatorWallet,
                clientWallet: releaseModal.clientWallet,
                tokenType: releaseModal.tokenType,
              }),
            });
          } catch {
            // non-blocking: referral accrual should not block withdrawal success
          }
        }
        addNotification({ type: 'success', title: 'Funds Withdrawn', message: `Withdrew ${formatAmount(releaseModal.releaseableAmount, releaseModal.tokenType)} from ${releaseModal.invoiceId}` });
        lastFetchedAt.current = 0;
        await fetchAll();
      } else {
        toast({ title: 'Withdrawal failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Withdrawal failed', description: e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
    } finally { setReleasing(null); setReleaseModal(null); }
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

  const openProofModal = (invoiceId: string, creatorWallet: string) => {
    setProofModal({
      invoiceId,
      creatorWallet,
      deliverableUrl: '',
      proofText: '',
    });
  };

  const handleSubmitProof = async () => {
    if (!proofModal || !publicKey) return;
    const deliverableUrl = proofModal.deliverableUrl.trim();
    const proofText = proofModal.proofText.trim();
    if (!deliverableUrl && !proofText) {
      toast({
        title: 'Add proof first',
        description: 'Add a deliverable link or a short proof summary.',
        variant: 'destructive',
      });
      return;
    }

    setSubmittingProof(proofModal.invoiceId);
    try {
      const token = await getAccessToken();
      const response = await fetch('/api/agent-verifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          invoiceId: proofModal.invoiceId,
          creatorWallet: proofModal.creatorWallet,
          submittedByWallet: publicKey.toBase58(),
          deliverableUrl: deliverableUrl || undefined,
          proofText: proofText || undefined,
        }),
      });
      const data = await response.json().catch(() => ({})) as {
        error?: string;
        agent_verification?: AgentVerificationMeta | null;
      };
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);

      const key = `${proofModal.invoiceId}:${proofModal.creatorWallet}`;
      setAgentVerificationMeta(prev => ({
        ...prev,
        [key]: data.agent_verification ?? prev[key] ?? null,
      }));
      toast({
        title: 'Proof submitted',
        description: 'The agent recommendation has been updated.',
      });
      setProofModal(null);
    } catch (error) {
      toast({
        title: 'Proof submission failed',
        description: error instanceof Error ? error.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingProof(null);
    }
  };

  // ============================================================
  // CLIENT ACTIONS
  // ============================================================

  const handleApprove = async (inv: InvoiceData) => {
    if (!sdk) return;
    setApproving(inv.invoiceId);
    try {
      const result = await sdk.approveRelease(inv.invoiceId, inv.creator);
      if (result.success) {
        try {
          const token = await getAccessToken();
          await fetch('/api/notify-creator', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              invoiceId: inv.invoiceId,
              creatorWallet: inv.creator.toBase58(),
              clientWallet: publicKey?.toBase58() ?? null,
              event: 'release_approved',
              amount: formatAmount(inv.amountPaid, inv.tokenType),
            }),
          });
        } catch { /* non-blocking */ }
        toast({ title: 'Withdrawal approved' });
        addNotification({ type: 'success', title: 'Withdrawal Approved', message: `You approved withdrawal for ${inv.invoiceId}.` });
        lastFetchedAt.current = 0; await fetchAll();
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
        try {
          const token = await getAccessToken();
          await fetch('/api/disputes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              action: 'open',
              invoiceId: inv.invoiceId,
              openedByWallet: publicKey?.toBase58() ?? '',
            }),
          });
          await fetch('/api/notify-creator', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              invoiceId: inv.invoiceId,
              creatorWallet: inv.creator.toBase58(),
              clientWallet: publicKey?.toBase58() ?? null,
              event: 'disputed',
              amount: formatAmount(inv.amountPaid, inv.tokenType),
            }),
          });
        } catch { /* non-blocking */ }
        toast({ title: 'Dispute raised', description: 'Funds frozen. Truvlo will review the case.' });
        addNotification({ type: 'warning', title: 'Dispute Raised', message: `Dispute opened for ${inv.invoiceId}.` });
        lastFetchedAt.current = 0; await fetchAll();
      } else {
        toast({ title: 'Dispute failed', description: typeof result.error === 'string' ? result.error : 'Failed', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Dispute failed', description: e instanceof Error && e.message.includes('rejected') ? 'Cancelled.' : 'Transaction failed.', variant: 'destructive' });
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
  const disputedInvoices = useMemo(() => {
    const byInvoice = new Map<string, InvoiceWithKey>();
    for (const invoice of [...sentInvoices, ...clientInvoices]) {
      if (invoice.account.status !== InvoiceStatus.Disputed) continue;
      byInvoice.set(`${invoice.account.invoiceId}:${invoice.account.creator.toBase58()}`, invoice);
    }
    return Array.from(byInvoice.values());
  }, [sentInvoices, clientInvoices]);
  const disputeCount = disputedInvoices.length;
  const activeDisputeSample = disputedInvoices[0]?.account.invoiceId;

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
  const activeDashboardInvoice = roleTab === 'client'
    ? (clientSection === 'action' ? awaitingAction[0] : paymentHistory[0])
    : roleTab === 'received'
      ? filteredReceived[0]
      : filteredSent[0];
  const activeDashboardAccount = activeDashboardInvoice?.account;

  // ============================================================
  // NOT CONNECTED
  // ============================================================

  if (!connected) {
    return (
      <div
        className="trust-panel max-w-md mx-auto p-12 text-center"
      >
        <FileText className="h-10 w-10 mx-auto mb-4" style={{ color: 'var(--tl-dim)' }} />
        <p style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
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
  const getAgentReviewStatus = (invoiceId: string, creatorWallet: string) => {
    const review = agentVerificationMeta[`${invoiceId}:${creatorWallet}`];
    if (!review) return null;
    if (review.verification_status === 'passed') return { label: 'Looks complete', color: '#4ADE80' };
    if (review.verification_status === 'failed') return { label: 'Risk flagged', color: '#F87171' };
    if (review.verification_status === 'pending') return { label: 'Agent review pending', color: '#FCD34D' };
    return { label: 'Needs review', color: '#FCD34D' };
  };

  const renderCreatorCard = (invoice: InvoiceWithKey) => {
    const inv = invoice.account;
    const creatorWallet = inv.creator.toBase58();
    const agentReview = getAgentReviewStatus(inv.invoiceId, creatorWallet);
    const total = fromSmallestUnit(inv.amount, inv.tokenType);
    const paid = fromSmallestUnit(inv.amountPaid, inv.tokenType);
    const progressPercent = total > 0 ? (paid / total) * 100 : 0;
    const releaseable = getReleaseable(inv);
    const schedule = inv.releaseSchedule ?? [];
    const scheduleIdx = inv.currentReleaseIndex ?? 0;
    const hasSchedule = schedule.length > 0;
    const currentBps = hasSchedule && scheduleIdx < schedule.length ? schedule[scheduleIdx] : null;
    const currentInstallment = currentBps !== null
      ? parseFloat((paid * currentBps / 10000).toFixed(inv.tokenType === TokenType.USDC ? 6 : 9))
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
        className="trust-invoice-row rounded-lg p-4 transition-colors duration-150"
        style={{
          backgroundColor: 'rgba(17,24,32,0.86)',
          border: '1px solid var(--tl-border)',
          borderLeft: borderLeft(leftBorderColor),
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(22,29,38,0.96)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(17,24,32,0.86)')}
      >
        <div className="trust-ledger-row">
          <div className="min-w-0">
            <p className="trust-mono text-xs truncate" style={{ color: '#94A3B8' }}>{inv.invoiceId}</p>
            <p className="text-xs mt-1" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
              Created {formatDate(inv.createdAt)}
            </p>
            {hasSchedule && !isDisputed && (inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid) && (
              <p className="text-xs mt-1" style={{ color: '#FCD34D' }}>
                Next: {formatAmount(currentInstallment, inv.tokenType)} ({currentBps !== null ? currentBps / 100 : 0}%) - installment {scheduleIdx + 1} of {schedule.length}
              </p>
            )}
            {isDisputed && <p className="text-xs mt-1" style={{ color: '#FCD34D' }}>Funds frozen - dispute under review</p>}
            {releaseRequested && !isDisputed && !releaseReady && (
              <p className="text-xs mt-1" style={{ color: '#93C5FD' }}>Withdrawal requested - {formatCountdown(secondsLeft)}</p>
            )}
            {releaseRequested && !isDisputed && releaseReady && (
              <p className="text-xs mt-1" style={{ color: '#4ADE80' }}>
                {inv.clientApproved ? 'Client approved - ready to withdraw' : 'Timeout passed - ready to withdraw'}
              </p>
            )}
            {agentReview && (
              <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: agentReview.color, fontFamily: '"DM Sans", sans-serif' }}>
                <Bot className="h-3 w-3" />{agentReview.label}
              </p>
            )}
          </div>

          <div>
            <p className="trust-label lg:hidden">Amount</p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1rem', color: '#F8FAFC' }}>
              {formatAmount(inv.amount, inv.tokenType)}
            </p>
          </div>

          <div>
            <p className="trust-label lg:hidden">Paid</p>
            <p className="text-sm" style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif' }}>
              {formatAmount(inv.amountPaid, inv.tokenType)}
            </p>
            {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid || isDisputed) && (
              <div className="mt-2">
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${progressPercent}%`, backgroundColor: isDisputed ? '#F59E0B' : '#3B82F6' }}
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: '#64748B' }}>{progressPercent.toFixed(0)}%</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <DarkBadge variant={badgeVariant}>
              {isDisputed && <><AlertTriangle className="h-3 w-3" />Disputed</>}
              {!isDisputed && inv.status === InvoiceStatus.Unpaid && <><Clock className="h-3 w-3" />Pending</>}
              {!isDisputed && inv.status === InvoiceStatus.PartiallyPaid && <><Clock className="h-3 w-3" />Partial</>}
              {!isDisputed && inv.status === InvoiceStatus.FullyPaid && <><Check className="h-3 w-3" />In Escrow</>}
              {!isDisputed && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" />Withdrawn</>}
            </DarkBadge>
            <span className={`trust-status ${inv.tokenType === TokenType.USDC ? 'trust-status-green' : 'trust-status-blue'}`}>
              {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
            </span>
          </div>

          <div className="flex flex-col gap-2 items-start lg:items-end flex-shrink-0">
            <button
              onClick={() => handleCopyLink(inv.invoiceId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150"
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

            {agentReview && (
              <button
                onClick={() => openProofModal(inv.invoiceId, creatorWallet)}
                disabled={submittingProof === inv.invoiceId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 disabled:opacity-50"
                style={{
                  backgroundColor: 'rgba(45,212,191,0.1)',
                  border: '1px solid rgba(45,212,191,0.28)',
                  color: '#5EEAD4',
                  fontFamily: '"DM Sans", sans-serif',
                  cursor: submittingProof === inv.invoiceId ? 'default' : 'pointer',
                }}
              >
                {submittingProof === inv.invoiceId
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Submitting...</>
                  : <><FileText className="h-3.5 w-3.5" />Submit proof</>}
              </button>
            )}

            {canRequest && (
              <button
                onClick={() => handleRequestRelease(inv)}
                disabled={requesting === inv.invoiceId}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 disabled:opacity-50"
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
                  : <><SendHorizonal className="h-3.5 w-3.5" />Request Withdrawal</>}
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
                  {hasSchedule ? `Withdraw ${formatAmount(currentInstallment, inv.tokenType)}` : `Withdraw to Wallet`}
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
    const creatorWallet = inv.creator.toBase58();
    const creatorName = clientInvoiceMeta[`${inv.invoiceId}:${creatorWallet}`]?.sender_name;
    const agentReview = getAgentReviewStatus(inv.invoiceId, creatorWallet);

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
        className="trust-invoice-row rounded-lg p-4 transition-colors duration-150"
        style={{
          backgroundColor: 'rgba(17,24,32,0.86)',
          border: '1px solid var(--tl-border)',
          borderLeft: borderLeft(leftBorderColor),
        }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(22,29,38,0.96)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(17,24,32,0.86)')}
      >
        <div className="trust-ledger-row">
          <div className="min-w-0">
            <p className="trust-mono text-xs truncate" style={{ color: '#94A3B8' }}>{inv.invoiceId}</p>
            <p className="text-xs mt-1" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
              From: <span style={{ fontFamily: creatorName ? '"DM Sans", sans-serif' : '"JetBrains Mono", monospace' }}>{creatorName || truncateWallet(creatorWallet)}</span> - {formatDate(inv.createdAt)}
            </p>
            {schedule.length > 1 && (
              <p className="text-xs mt-1" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
                Installment {scheduleIdx + 1} of {schedule.length} - {formatAmount(released, inv.tokenType)} withdrawn of {formatAmount(paid, inv.tokenType)}
              </p>
            )}
            {isDisputed && <p className="text-xs mt-1" style={{ color: '#FCD34D' }}>Funds frozen - dispute under review</p>}
            {needsAction && <p className="text-xs mt-1" style={{ color: '#93C5FD' }}>Creator requested withdrawal - {formatCountdown(secondsLeft)}</p>}
            {clientApproved && !isDisputed && <p className="text-xs mt-1" style={{ color: '#4ADE80' }}>You approved this withdrawal</p>}
            {agentReview && (
              <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: agentReview.color, fontFamily: '"DM Sans", sans-serif' }}>
                <Bot className="h-3 w-3" />{agentReview.label}
              </p>
            )}
          </div>

          <div>
            <p className="trust-label lg:hidden">Amount</p>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1rem', color: '#F8FAFC' }}>
              {formatAmount(inv.amount, inv.tokenType)}
            </p>
          </div>

          <div>
            <p className="trust-label lg:hidden">Paid</p>
            <p className="text-sm" style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif' }}>
              {formatAmount(inv.amountPaid, inv.tokenType)}
            </p>
            {(inv.status === InvoiceStatus.PartiallyPaid || inv.status === InvoiceStatus.FullyPaid || isDisputed) && (
              <div className="mt-2">
                <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${progressPercent}%`, backgroundColor: isDisputed ? '#F59E0B' : '#3B82F6' }}
                  />
                </div>
                <p className="text-[11px] mt-1" style={{ color: '#64748B' }}>{progressPercent.toFixed(0)}%</p>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <DarkBadge variant={badgeVariant}>
              {isDisputed && <><AlertTriangle className="h-3 w-3" />Disputed</>}
              {!isDisputed && needsAction && <><Clock className="h-3 w-3" />Action needed</>}
              {!isDisputed && !needsAction && clientApproved && <><Check className="h-3 w-3" />Approved</>}
              {!isDisputed && !needsAction && !clientApproved && inv.status === InvoiceStatus.Released && <><ArrowUpRight className="h-3 w-3" />Withdrawn</>}
              {!isDisputed && !needsAction && !clientApproved && inv.status !== InvoiceStatus.Released && <><Check className="h-3 w-3" />In escrow</>}
            </DarkBadge>
            <span className={`trust-status ${inv.tokenType === TokenType.USDC ? 'trust-status-green' : 'trust-status-blue'}`}>
              {inv.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
            </span>
          </div>

          <div className="flex flex-col gap-2 items-start lg:items-end flex-shrink-0">
            <button
              onClick={() => window.open(`${window.location.origin}/invoice/${inv.invoiceId}/${inv.creator.toBase58()}`, '_blank')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150"
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
                    : <><ThumbsUp className="h-3.5 w-3.5" />Approve Withdrawal</>}
                </button>
                <button
                  onClick={() => handleDispute(inv)}
                  disabled={approving === inv.invoiceId || disputing === inv.invoiceId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 disabled:opacity-50"
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

  // ============================================================
  // TAB STYLES — MOBILE FIX: scrollable, no clipping
  // ============================================================

  const tabListStyle: React.CSSProperties = {
    backgroundColor: 'rgba(17,24,32,0.88)',
    border: '1px solid var(--tl-border)',
    borderRadius: '8px',
    padding: '4px',
    overflowX: 'auto',
    overflowY: 'hidden',
    display: 'flex',
    flexWrap: 'nowrap',
    width: '100%',
    minHeight: '44px',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'pan-x',
    overscrollBehaviorY: 'none',
  };

  const tabTriggerStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: '"DM Sans", sans-serif',
    fontSize: '13px',
    color: active ? 'var(--tl-text)' : 'var(--tl-muted)',
    backgroundColor: active ? 'var(--tl-surface-2)' : 'transparent',
    borderRadius: '6px',
    padding: '6px 12px',
    border: active ? '1px solid var(--tl-border-strong)' : '1px solid transparent',
    cursor: 'pointer',
    transition: 'background-color 150ms ease, border-color 150ms ease, color 150ms ease',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    minHeight: '34px',
  });

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Page header — MOBILE FIX: stacks vertically on mobile */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: '2rem',
              color: 'var(--tl-text)',
              letterSpacing: '-0.03em',
              lineHeight: 1.2,
            }}
          >
            {displayName ? `Hey, ${displayName}` : 'Dashboard'}
          </h1>
          {publicKey && (
            <Link
              to="/account"
              className="flex items-center gap-1 transition-opacity duration-150 hover:opacity-70 w-fit"
              style={{ textDecoration: 'none' }}
              title="Open your account hub"
            >
              <p
                style={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '12px',
                  color: 'var(--tl-dim)',
                  marginTop: '4px',
                }}
              >
                {displayName || 'Account'}
              </p>
              <ExternalLink
                className="h-3 w-3"
                style={{ color: 'var(--tl-dim)', marginTop: '4px' }}
              />
            </Link>
          )}

        </div>

        {authenticated && allWallets.length === 0 && (
          <div
            className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between gap-3"
            style={{
                  backgroundColor: 'var(--tl-teal-soft)',
                  border: '1px solid rgba(20,200,186,0.22)',
            }}
          >
            <div>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#F8FAFC', fontSize: '0.98rem' }}>
                No wallet connected yet
              </p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#94A3B8', marginTop: '2px' }}>
                Create or import one to send, receive, and approve invoices.
              </p>
            </div>
            <Link
              to="/wallet"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                style={{ backgroundColor: 'var(--tl-teal)', color: '#061110', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
            >
              <WalletIcon className="h-4 w-4" />
              Set up wallet
            </Link>
          </div>
        )}

        {/* MOBILE FIX: buttons wrap on small screens */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Notification bell */}
          <Popover open={notifOpen} onOpenChange={handleNotifOpen}>
            <PopoverTrigger asChild>
              <button
                className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150"
                style={{
                  backgroundColor: 'rgba(148,163,184,0.04)',
                  border: '1px solid var(--tl-border)',
                  cursor: 'pointer',
                  color: 'var(--tl-muted)',
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
            onClick={() => void fetchAll(true)}
            disabled={loading || refreshing}
            className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-150 disabled:opacity-50"
            style={{
              backgroundColor: 'rgba(148,163,184,0.04)',
              border: '1px solid var(--tl-border)',
              cursor: loading || refreshing ? 'default' : 'pointer',
              color: 'var(--tl-muted)',
            }}
            onMouseEnter={e => !(loading || refreshing) && (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Create invoice */}
          <Link
            to="/create"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: 'var(--tl-teal)',
              color: '#061110',
              fontFamily: '"DM Sans", sans-serif',
              textDecoration: 'none',
            }}
          >
            <Plus className="h-4 w-4" />Create Invoice
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && !loading && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3 mb-2"
          style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: '#F59E0B' }} />
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#94A3B8', flex: 1 }}>
            {fetchError}
          </p>
          <button
            onClick={() => { lastFetchedAt.current = 0; void fetchAll(true); }}
            style={{
              fontFamily: '"DM Sans", sans-serif', fontSize: '12px', fontWeight: 600,
              color: '#F59E0B', background: 'none', border: '1px solid rgba(245,158,11,0.3)',
              borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {disputeCount > 0 && (
        <div
          className="trust-panel-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3"
          style={{ borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.08)' }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: '#FCD34D' }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>
                {disputeCount} dispute{disputeCount === 1 ? '' : 's'} need attention
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                Funds stay frozen while Truvlo reviews the case record{activeDisputeSample ? ` for ${activeDisputeSample}` : ''}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSentFilter('disputed')}
            className="trust-button-secondary px-3 py-2 text-xs"
            style={{ color: '#FCD34D', borderColor: 'rgba(245,158,11,0.35)' }}
          >
            View disputes
          </button>
        </div>
      )}

      {/* Role tabs */}
      <div className="trust-dashboard-grid">
      <Tabs value={roleTab} onValueChange={(v) => setRoleTab(v as 'sent' | 'received' | 'client')}>
        <TabsList className="trust-tabs" style={tabListStyle}>
          <TabsTrigger value="sent" style={tabTriggerStyle(roleTab === 'sent')} className="flex items-center gap-1.5">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Sent ({sentStats.total})
          </TabsTrigger>
          <TabsTrigger value="received" style={tabTriggerStyle(roleTab === 'received')} className="flex items-center gap-1.5">
            <ArrowDownLeft className="h-3.5 w-3.5" />
            Received ({receivedStats.total})
          </TabsTrigger>
          <TabsTrigger value="client" style={tabTriggerStyle(roleTab === 'client')} className="flex items-center gap-1.5 relative">
            <WalletIcon className="h-3.5 w-3.5" />
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Pending Withdrawal" accentLeft={sentStats.pendingReleaseUSDC > 0 || sentStats.pendingReleaseSOL > 0 ? '#F59E0B' : undefined}>
              {formatStat(sentStats.pendingReleaseUSDC, sentStats.pendingReleaseSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '-' ? '#64748B' : '#FCD34D', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="In Escrow" accentLeft={sentStats.inEscrow > 0 ? '#3B82F6' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: sentStats.inEscrow > 0 ? '#93C5FD' : '#64748B' }}>{sentStats.inEscrow}</p>
            </StatCard>
            <StatCard label="Withdrawn" accentLeft={sentStats.released > 0 ? '#22C55E' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: sentStats.released > 0 ? '#4ADE80' : '#64748B' }}>{sentStats.released}</p>
            </StatCard>
            <StatCard label="Total Invoices">
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: '#F8FAFC' }}>{sentStats.total}</p>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>{sentStats.unpaid} pending</span>
                {sentStats.disputed > 0 && <span className="text-xs" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>- {sentStats.disputed} disputed</span>}
              </div>
            </StatCard>
          </div>

          {/* Sub-filter tabs */}
          <Tabs value={sentFilter} onValueChange={setSentFilter}>
            <TabsList className="trust-tabs" style={tabListStyle}>
              <TabsTrigger value="all" style={tabTriggerStyle(sentFilter === 'all')}>All ({sentStats.total})</TabsTrigger>
              <TabsTrigger value="unpaid" style={tabTriggerStyle(sentFilter === 'unpaid')}>Pending ({sentStats.unpaid})</TabsTrigger>
              <TabsTrigger value="escrow" style={tabTriggerStyle(sentFilter === 'escrow')}>In Escrow ({sentStats.inEscrow})</TabsTrigger>
              <TabsTrigger value="released" style={tabTriggerStyle(sentFilter === 'released')}>Withdrawn ({sentStats.released})</TabsTrigger>
              {sentStats.disputed > 0 && <TabsTrigger value="disputed" style={tabTriggerStyle(sentFilter === 'disputed')}>Disputed ({sentStats.disputed})</TabsTrigger>}
            </TabsList>
            <TabsContent value={sentFilter} className="mt-3">
              {loading && !hasLoadedOnce.current ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#2DD4BF' }} /></div>
              ) : filteredSent.length === 0 ? (
                <EmptyState message="No invoices yet." showCreate />
              ) : (
                <div className="space-y-2">
                  <div className="trust-ledger-heading">
                    <span>Invoice</span>
                    <span>Amount</span>
                    <span>Paid</span>
                    <span>Status</span>
                    <span>Action</span>
                  </div>
                  {filteredSent.map(renderCreatorCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ======= RECEIVED TAB ======= */}
        <TabsContent value="received" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Received">
              {formatStat(receivedStats.totalReceivedUSDC, receivedStats.totalReceivedSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '-' ? '#64748B' : '#F8FAFC', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="In Escrow" accentLeft={receivedStats.inEscrow > 0 ? '#3B82F6' : undefined}>
              {formatStat(receivedStats.inEscrowUSDC, receivedStats.inEscrowSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '-' ? '#64748B' : '#93C5FD', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="Withdrawn" accentLeft={receivedStats.released > 0 ? '#22C55E' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: receivedStats.released > 0 ? '#4ADE80' : '#64748B' }}>{receivedStats.released}</p>
            </StatCard>
            <StatCard label="Invoices Paid">
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: '#F8FAFC' }}>{receivedStats.total}</p>
              {receivedStats.disputed > 0 && <p className="text-xs" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>{receivedStats.disputed} disputed</p>}
            </StatCard>
          </div>

          <Tabs value={receivedFilter} onValueChange={setReceivedFilter}>
            <TabsList className="trust-tabs" style={tabListStyle}>
              <TabsTrigger value="all" style={tabTriggerStyle(receivedFilter === 'all')}>All ({receivedStats.total})</TabsTrigger>
              <TabsTrigger value="escrow" style={tabTriggerStyle(receivedFilter === 'escrow')}>In Escrow ({receivedStats.inEscrow})</TabsTrigger>
              <TabsTrigger value="released" style={tabTriggerStyle(receivedFilter === 'released')}>Withdrawn ({receivedStats.released})</TabsTrigger>
              {receivedStats.disputed > 0 && <TabsTrigger value="disputed" style={tabTriggerStyle(receivedFilter === 'disputed')}>Disputed ({receivedStats.disputed})</TabsTrigger>}
            </TabsList>
            <TabsContent value={receivedFilter} className="mt-3">
              {loading && !hasLoadedOnce.current ? (
                <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#2DD4BF' }} /></div>
              ) : filteredReceived.length === 0 ? (
                <EmptyState message="No paid invoices yet. Once a client pays, it appears here." />
              ) : (
                <div className="space-y-2">
                  <div className="trust-ledger-heading">
                    <span>Invoice</span>
                    <span>Amount</span>
                    <span>Paid</span>
                    <span>Status</span>
                    <span>Action</span>
                  </div>
                  {filteredReceived.map(renderCreatorCard)}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ======= CLIENT TAB ======= */}
        <TabsContent value="client" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Total Paid Out">
              {formatStat(clientStats.totalPaidUSDC, clientStats.totalPaidSOL).map((l, i) => (
                <p key={i} style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1rem', color: l === '-' ? '#64748B' : '#F8FAFC', lineHeight: 1.3 }}>{l}</p>
              ))}
            </StatCard>
            <StatCard label="Awaiting Action" accentLeft={clientStats.awaitingAction > 0 ? '#3B82F6' : undefined}>
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: clientStats.awaitingAction > 0 ? '#93C5FD' : '#64748B' }}>{clientStats.awaitingAction}</p>
            </StatCard>
            <StatCard label="Withdrawn" accentLeft={clientStats.released > 0 ? '#22C55E' : undefined}>
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
              className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
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
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-150"
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

          {loading && !hasLoadedOnce.current ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" style={{ color: '#2DD4BF' }} /></div>
          ) : clientSection === 'action' ? (
            awaitingAction.length === 0 ? (
              <EmptyState message="No invoices awaiting your approval right now." />
            ) : (
              <div className="space-y-2">
                <div className="trust-ledger-heading">
                  <span>Invoice</span>
                  <span>Amount</span>
                  <span>Paid</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                {awaitingAction.map(i => renderClientCard(i, true))}
              </div>
            )
          ) : (
            paymentHistory.length === 0 ? (
              <EmptyState message="No payment history yet. Invoices you pay will appear here." />
            ) : (
              <div className="space-y-2">
                <div className="trust-ledger-heading">
                  <span>Invoice</span>
                  <span>Amount</span>
                  <span>Paid</span>
                  <span>Status</span>
                  <span>Action</span>
                </div>
                {paymentHistory.map(i => renderClientCard(i, false))}
              </div>
            )
          )}
        </TabsContent>
      </Tabs>

      <aside className="trust-panel hidden lg:block p-4 sticky top-24">
        <p className="trust-label">Selected record</p>
        {activeDashboardAccount ? (
          <div className="mt-4 space-y-4">
            <div>
              <p className="trust-mono text-xs" style={{ color: 'var(--tl-dim)' }}>{activeDashboardAccount.invoiceId}</p>
              <p className="mt-2 text-xl font-bold" style={{ fontFamily: '"Space Grotesk", sans-serif', color: 'var(--tl-text)' }}>
                {formatAmount(activeDashboardAccount.amount, activeDashboardAccount.tokenType)}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="trust-status trust-status-blue">
                  {activeDashboardAccount.tokenType === TokenType.USDC ? 'USDC' : 'SOL'}
                </span>
                {activeDashboardAccount.status === InvoiceStatus.Disputed && <span className="trust-status trust-status-amber">Disputed</span>}
                {activeDashboardAccount.status === InvoiceStatus.Released && <span className="trust-status trust-status-green">Withdrawn</span>}
              </div>
            </div>

            <div className="space-y-3 border-t pt-4" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
              <div className="flex justify-between gap-3 text-xs">
                <span style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>Creator</span>
                <span className="trust-mono" style={{ color: 'var(--tl-muted)' }}>{truncateWallet(activeDashboardAccount.creator.toBase58())}</span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>Client</span>
                <span className="trust-mono" style={{ color: 'var(--tl-muted)' }}>
                  {activeDashboardAccount.client ? truncateWallet(activeDashboardAccount.client.toBase58()) : 'Not paid'}
                </span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>Created</span>
                <span style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>{formatDate(activeDashboardAccount.createdAt)}</span>
              </div>
              <div className="flex justify-between gap-3 text-xs">
                <span style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>Paid</span>
                <span style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>{formatAmount(activeDashboardAccount.amountPaid, activeDashboardAccount.tokenType)}</span>
              </div>
            </div>

            <div className="border-t pt-4" style={{ borderColor: 'rgba(148,163,184,0.12)' }}>
              <p className="text-xs leading-5" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                This panel mirrors the current invoice state. Actions still happen from the invoice row so the existing workflow stays unchanged.
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm leading-6" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
            Select a tab with invoice activity to see the current ledger state.
          </p>
        )}
      </aside>
      </div>

      {/* Proof Modal */}
      {proofModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.72)' }}
        >
          <div
            className="w-full max-w-lg rounded-lg p-5"
            style={{
              backgroundColor: '#111820',
              border: '1px solid rgba(45,212,191,0.24)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className="text-lg font-semibold"
                  style={{ color: '#F8FAFC', fontFamily: '"Space Grotesk", sans-serif' }}
                >
                  Submit proof
                </p>
                <p
                  className="mt-2 text-sm leading-6"
                  style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}
                >
                  Add the deliverable and evidence. Truvlo updates the agent recommendation, while release still requires approval.
                </p>
              </div>
              <button
                onClick={() => setProofModal(null)}
                className="rounded-lg px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(148,163,184,0.16)',
                  color: '#94A3B8',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span
                  className="block text-xs uppercase tracking-widest mb-2"
                  style={{ color: '#93C5FD', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.08em' }}
                >
                  Deliverable URL
                </span>
                <input
                  value={proofModal.deliverableUrl}
                  onChange={event => setProofModal(prev => prev ? { ...prev, deliverableUrl: event.target.value } : prev)}
                  placeholder="https://..."
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none"
                  style={{
                    backgroundColor: 'rgba(15,23,32,0.92)',
                    border: '1px solid rgba(148,163,184,0.16)',
                    color: '#F8FAFC',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                />
              </label>

              <label className="block">
                <span
                  className="block text-xs uppercase tracking-widest mb-2"
                  style={{ color: '#93C5FD', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.08em' }}
                >
                  Proof text
                </span>
                <textarea
                  value={proofModal.proofText}
                  onChange={event => setProofModal(prev => prev ? { ...prev, proofText: event.target.value } : prev)}
                  placeholder="Summarize what was delivered, tests passed, files included, or acceptance notes..."
                  rows={5}
                  className="w-full rounded-lg px-4 py-3 text-sm outline-none resize-none"
                  style={{
                    backgroundColor: 'rgba(15,23,32,0.92)',
                    border: '1px solid rgba(148,163,184,0.16)',
                    color: '#F8FAFC',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                onClick={() => setProofModal(null)}
                className="rounded-lg px-4 py-2 text-sm"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(148,163,184,0.16)',
                  color: '#CBD5E1',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitProof}
                disabled={submittingProof === proofModal.invoiceId}
                className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60"
                style={{
                  backgroundColor: '#2DD4BF',
                  color: '#0D1117',
                  border: 'none',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {submittingProof === proofModal.invoiceId
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</>
                  : <><FileText className="h-4 w-4" />Submit proof</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
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
