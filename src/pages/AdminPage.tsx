import React, { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import Header from '@/components/Header';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { CONTRACT_PLATFORM_TREASURY_WALLET } from '@/lib/admin';
import { EscrowPaySDK } from '@/lib/escrowPaySDK';
import { createPrivySolanaAnchorWallet } from '@/lib/privySolanaAnchorWallet';
import { sendSponsoredSolanaTransaction } from '@/lib/privySponsoredSolana';
import {
  Banknote,
  FileText,
  Gift,
  Gavel,
  Loader2,
  MailWarning,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

type AdminOverview = {
  admin?: {
    privy_id: string;
    wallet_address: string;
    role: 'owner' | 'dispute_admin' | 'payout_admin' | 'support_admin';
  };
  allowed_sections?: AdminSectionId[];
  warnings?: string[];
  summary: Record<string, unknown>;
  profiles: Array<Record<string, unknown>>;
  wallets: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  failed_emails: Array<Record<string, unknown>>;
  disputes: Array<Record<string, unknown>>;
  referral_rewards: Array<Record<string, unknown>>;
  payout_requests: Array<Record<string, unknown>>;
};

type AdminSectionId = 'invoices' | 'profiles' | 'wallets' | 'disputes' | 'failed_emails' | 'referral_rewards' | 'payout_requests';
type DisputeStatusFilter = 'open' | 'under_review' | 'resolved';

type AdminSection = {
  id: AdminSectionId;
  label: string;
  title: string;
  summaryKey: string;
  dataKey: AdminSectionId;
  icon: LucideIcon;
  accent: string;
  columns: Array<{ key: string; label: string; date?: boolean }>;
};

const colors = {
  background: 'var(--tl-bg)',
  surface: 'var(--tl-surface)',
  surfaceSoft: 'var(--tl-bg-soft)',
  border: 'var(--tl-border)',
  borderSoft: 'rgba(148, 163, 184, 0.10)',
  text: 'var(--tl-text)',
  muted: 'var(--tl-muted)',
  dim: 'var(--tl-dim)',
  teal: 'var(--tl-teal)',
  amber: '#FCD34D',
  red: '#FCA5A5',
};

const adminSections: AdminSection[] = [
  {
    id: 'invoices',
    label: 'Invoices',
    title: 'Recent Invoices',
    summaryKey: 'invoices',
    dataKey: 'invoices',
    icon: FileText,
    accent: colors.teal,
    columns: [
      { key: 'invoice_id', label: 'Invoice' },
      { key: 'sender_name', label: 'Creator name' },
      { key: 'creator_wallet', label: 'Creator wallet' },
      { key: 'client_wallet', label: 'Client wallet' },
      { key: 'amount', label: 'Amount' },
      { key: 'token_type', label: 'Token' },
      { key: 'created_at', label: 'Created', date: true },
    ],
  },
  {
    id: 'profiles',
    label: 'Profiles',
    title: 'Recent Profiles',
    summaryKey: 'profiles',
    dataKey: 'profiles',
    icon: Users,
    accent: '#A8C7ED',
    columns: [
      { key: 'display_name', label: 'Name' },
      { key: 'notification_email', label: 'Email' },
      { key: 'privy_id', label: 'Privy ID' },
      { key: 'referral_code', label: 'Code' },
      { key: 'onboarding_completed_at', label: 'Onboarded', date: true },
      { key: 'created_at', label: 'Created', date: true },
    ],
  },
  {
    id: 'wallets',
    label: 'Wallets',
    title: 'Wallets',
    summaryKey: 'wallets',
    dataKey: 'wallets',
    icon: Wallet,
    accent: '#60A5FA',
    columns: [
      { key: 'wallet_address', label: 'Wallet' },
      { key: 'privy_id', label: 'Privy ID' },
      { key: 'created_at', label: 'Created', date: true },
    ],
  },
  {
    id: 'disputes',
    label: 'Disputes',
    title: 'Disputes',
    summaryKey: 'disputes',
    dataKey: 'disputes',
    icon: Gavel,
    accent: colors.amber,
    columns: [
      { key: 'invoice_id', label: 'Invoice' },
      { key: 'status', label: 'Status' },
      { key: 'opened_by_role', label: 'Opened by' },
      { key: 'recommendation_decision', label: 'Recommendation' },
      { key: 'recommendation_confidence', label: 'Confidence' },
      { key: 'token_type', label: 'Token' },
      { key: 'onchain_resolved_at', label: 'On-chain', date: true },
      { key: 'creator_wallet', label: 'Creator' },
      { key: 'client_wallet', label: 'Client' },
      { key: 'opened_at', label: 'Opened', date: true },
      { key: 'evidence_deadline_at', label: 'Deadline', date: true },
    ],
  },
  {
    id: 'failed_emails',
    label: 'Email issues',
    title: 'Email Delivery Issues',
    summaryKey: 'failed_emails',
    dataKey: 'failed_emails',
    icon: MailWarning,
    accent: colors.red,
    columns: [
      { key: 'invoice_id', label: 'Invoice' },
      { key: 'sender_name', label: 'Creator name' },
      { key: 'client_email', label: 'Client email' },
      { key: 'amount', label: 'Amount' },
      { key: 'token_type', label: 'Token' },
      { key: 'created_at', label: 'Created', date: true },
    ],
  },
  {
    id: 'referral_rewards',
    label: 'Rewards',
    title: 'Referral Rewards',
    summaryKey: 'referral_rewards',
    dataKey: 'referral_rewards',
    icon: Gift,
    accent: '#34D399',
    columns: [
      { key: 'invoice_id', label: 'Invoice' },
      { key: 'source_role', label: 'Source' },
      { key: 'referral_code', label: 'Code' },
      { key: 'reward_amount', label: 'Reward' },
      { key: 'token_type', label: 'Token' },
      { key: 'status', label: 'Status' },
      { key: 'created_at', label: 'Created', date: true },
    ],
  },
  {
    id: 'payout_requests',
    label: 'Payouts',
    title: 'Payout Requests',
    summaryKey: 'payout_requests',
    dataKey: 'payout_requests',
    icon: Banknote,
    accent: '#C084FC',
    columns: [
      { key: 'privy_id', label: 'Privy ID' },
      { key: 'amount', label: 'Amount' },
      { key: 'token_type', label: 'Token' },
      { key: 'status', label: 'Status' },
      { key: 'payout_wallet', label: 'Wallet' },
      { key: 'payout_cycle_date', label: 'Cycle' },
      { key: 'requested_at', label: 'Requested', date: true },
    ],
  },
];

const panelStyle: React.CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
};

const labelStyle: React.CSSProperties = {
  color: '#7890B5',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
};

const disputeStatusFilters: Array<{ id: DisputeStatusFilter; label: string }> = [
  { id: 'open', label: 'Open' },
  { id: 'under_review', label: 'In review' },
  { id: 'resolved', label: 'Resolved' },
];

function shortValue(value: unknown): string {
  if (value == null || value === '') return '-';
  const text = String(value);
  if (text.length > 22) return `${text.slice(0, 8)}...${text.slice(-8)}`;
  return text;
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function sha512Bytes(text: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-512', encoded);
  return new Uint8Array(digest);
}

function getSectionFromHash(): AdminSectionId {
  if (typeof window === 'undefined') return 'invoices';
  const hash = window.location.hash.replace('#', '') as AdminSectionId;
  return adminSections.some(section => section.id === hash) ? hash : 'invoices';
}

const StatCard = ({
  label,
  value,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: unknown;
  icon: LucideIcon;
  accent: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    className={`admin-stat-card ${active ? 'admin-stat-card-active' : ''}`}
    onClick={onClick}
    aria-pressed={active}
  >
    <div className="admin-stat-icon" style={{ color: accent, backgroundColor: `${accent}18`, borderColor: `${accent}35` }}>
      <Icon className="h-4 w-4" />
    </div>
    <div>
      <p style={labelStyle}>{label}</p>
      <p className="admin-stat-value">{String(value ?? 0)}</p>
    </div>
  </button>
);

const DataPanel = ({
  title,
  rows,
  columns,
  actionLabel,
  actionBusyId,
  onAction,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; date?: boolean }>;
  actionLabel?: string;
  actionBusyId?: string | null;
  onAction?: (row: Record<string, unknown>) => void;
}) => (
  <section className="admin-data-panel">
    <div className="admin-data-panel-header">
      <h2 className="admin-data-panel-title">{title}</h2>
      <span className="admin-data-panel-count">{rows.length}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left admin-table" style={{ minWidth: '760px' }}>
        <thead>
          <tr>
            {columns.map(column => <th key={column.key}>{column.label}</th>)}
            {onAction && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (onAction ? 1 : 0)} className="admin-empty-cell">
                No records found.
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {columns.map(column => (
                <td key={column.key} className={column.key.includes('wallet') || column.key.includes('id') ? 'admin-mono-cell' : undefined}>
                  {column.date ? formatDate(row[column.key]) : shortValue(row[column.key])}
                </td>
              ))}
              {onAction && (
                <td>
                  <button
                    type="button"
                    className="admin-inline-button"
                    onClick={() => onAction(row)}
                    disabled={!row.id || actionBusyId === String(row.id)}
                  >
                    {actionBusyId === String(row.id) ? 'Running' : actionLabel}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </section>
);

const AdminPage: React.FC = () => {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { activeWallet } = useActiveWallet();
  const { connection } = useConnection();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<AdminSectionId>(() => getSectionFromHash());
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);
  const [recommendationCaseId, setRecommendationCaseId] = useState<string | null>(null);
  const [selectedDispute, setSelectedDispute] = useState<Record<string, unknown> | null>(null);
  const [disputeStatusFilter, setDisputeStatusFilter] = useState<DisputeStatusFilter>('open');
  const [resolutionDecision, setResolutionDecision] = useState<'creator' | 'client' | 'split'>('split');
  const [creatorShareBps, setCreatorShareBps] = useState(5000);
  const [clientShareBps, setClientShareBps] = useState(5000);
  const [resolutionNote, setResolutionNote] = useState('');
  const [resolvingCaseId, setResolvingCaseId] = useState<string | null>(null);
  const [onChainCaseId, setOnChainCaseId] = useState<string | null>(null);

  const activeAddress = activeWallet?.address ?? null;

  const createAdminSdk = useCallback(() => {
    if (!activeWallet || !activeAddress) return null;
    const publicKey = new PublicKey(activeAddress);
    const anchorWallet = createPrivySolanaAnchorWallet(activeWallet, publicKey);
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
    const sponsorFn = async (tx: Uint8Array): Promise<string> => {
      return sendSponsoredSolanaTransaction(signAndSendTransaction, activeWallet, tx);
    };
    return new EscrowPaySDK(provider, false, sponsorFn);
  }, [activeAddress, activeWallet, connection, signAndSendTransaction]);

  const loadAdminData = useCallback(async () => {
    if (!activeAddress) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/admin-overview?wallet=${encodeURIComponent(activeAddress)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Admin data could not be loaded');
      setOverview(data as AdminOverview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Admin data could not be loaded');
      setOverview(null);
    } finally {
      setLoading(false);
    }
  }, [activeAddress, getAccessToken]);

  useEffect(() => {
    if (ready && authenticated && activeAddress) {
      void loadAdminData();
    }
  }, [ready, authenticated, activeAddress, loadAdminData]);

  useEffect(() => {
    const handleHashChange = () => setActiveSectionId(getSectionFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const accessButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    padding: '0 22px',
    borderRadius: 8,
    backgroundColor: colors.teal,
    color: '#071014',
    fontFamily: '"DM Sans", sans-serif',
    fontSize: 14,
    fontWeight: 700,
    border: 0,
    cursor: 'pointer',
  };

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: colors.amber }} />
          <h1 style={{ color: colors.text, fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Admin access</h1>
          <p className="mt-3" style={{ color: colors.muted, fontFamily: '"DM Sans", sans-serif' }}>Preparing wallet authentication...</p>
        </main>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: colors.amber }} />
          <h1 style={{ color: colors.text, fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Admin access</h1>
          <p className="mt-3 mb-6" style={{ color: colors.muted, fontFamily: '"DM Sans", sans-serif' }}>Connect the admin wallet to view operations.</p>
          <button onClick={() => login()} style={accessButtonStyle}>Connect admin wallet</button>
        </main>
      </div>
    );
  }

  if (!activeAddress) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: colors.red }} />
          <h1 style={{ color: colors.text, fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Unauthorized</h1>
          <p className="mt-3" style={{ color: colors.muted, fontFamily: '"DM Sans", sans-serif' }}>
            Connect an admin wallet to view this page.
          </p>
        </main>
      </div>
    );
  }

  const summary = overview?.summary ?? {};
  const visibleSections = overview?.allowed_sections
    ? adminSections.filter(section => overview.allowed_sections?.includes(section.id))
    : adminSections;
  const activeSection = visibleSections.find(section => section.id === activeSectionId) ?? visibleSections[0] ?? adminSections[0];
  const rawActiveRows = overview?.[activeSection.dataKey] ?? [];
  const disputeRows = overview?.disputes ?? [];
  const disputeStatusCounts = disputeStatusFilters.reduce<Record<DisputeStatusFilter, number>>((counts, filter) => {
    counts[filter.id] = disputeRows.filter(row => row.status === filter.id).length;
    return counts;
  }, { open: 0, under_review: 0, resolved: 0 });
  const activeRows = activeSection.id === 'disputes'
    ? rawActiveRows.filter(row => row.status === disputeStatusFilter)
    : rawActiveRows;
  const adminRole = overview?.admin?.role ?? null;

  const selectSection = (sectionId: AdminSectionId) => {
    setActiveSectionId(sectionId);
    if (sectionId !== 'disputes') {
      setSelectedDispute(null);
    }
    if (window.location.hash !== `#${sectionId}`) {
      window.history.replaceState(null, '', `#${sectionId}`);
    }
  };

  const selectDispute = (row: Record<string, unknown>) => {
    setSelectedDispute(row);
    const recommendedDecision = row.recommendation_decision === 'creator' || row.recommendation_decision === 'client' || row.recommendation_decision === 'split'
      ? row.recommendation_decision
      : 'split';
    setResolutionDecision(recommendedDecision);
    const creatorBps = Number(row.recommendation_creator_bps ?? (recommendedDecision === 'creator' ? 10000 : recommendedDecision === 'client' ? 0 : 5000));
    const clientBps = Number(row.recommendation_client_bps ?? (recommendedDecision === 'creator' ? 0 : recommendedDecision === 'client' ? 10000 : 5000));
    setCreatorShareBps(Number.isFinite(creatorBps) ? creatorBps : 5000);
    setClientShareBps(Number.isFinite(clientBps) ? clientBps : 5000);
    setResolutionNote(String(row.recommendation_note ?? ''));
  };

  const selectDisputeStatusFilter = (filter: DisputeStatusFilter) => {
    setDisputeStatusFilter(filter);
    setSelectedDispute(null);
  };

  const reconcileDisputes = async () => {
    if (!activeAddress) return;
    setReconciling(true);
    setReconcileMessage(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/admin-overview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'reconcile_disputes', adminWallet: activeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Reconciliation failed');
      setReconcileMessage(`Checked ${data.checked ?? 0}, backfilled ${data.created ?? 0}.`);
      await loadAdminData();
    } catch (err) {
      setReconcileMessage(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  const resolveDisputeOffchain = async () => {
    if (!activeAddress) {
      setReconcileMessage('Admin wallet is not ready. Refresh the page after Privy finishes loading your wallet.');
      return;
    }
    if (!selectedDispute?.id) {
      setReconcileMessage('Select a dispute row again before recording the final decision.');
      return;
    }
    const caseId = String(selectedDispute.id);
    if (creatorShareBps + clientShareBps !== 10000) {
      setReconcileMessage('Creator and client basis points must total 10000.');
      return;
    }
    setResolvingCaseId(caseId);
    setReconcileMessage(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'resolve',
          caseId,
          adminWallet: activeAddress,
          decision: resolutionDecision,
          creatorShareBps,
          clientShareBps,
          verdictNote: resolutionNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Resolution failed');
      setReconcileMessage('Final decision saved. Use "Resolve and move funds" to sign the treasury transaction.');
      await loadAdminData();
      setSelectedDispute({ ...selectedDispute, ...(data.dispute_case as Record<string, unknown>) });
    } catch (err) {
      setReconcileMessage(err instanceof Error ? err.message : 'Resolution failed');
    } finally {
      setResolvingCaseId(null);
    }
  };

  const resolveDisputeOnChain = async () => {
    if (!activeAddress) {
      setReconcileMessage('Admin wallet is not ready. Refresh the page after Privy finishes loading your wallet.');
      return;
    }
    if (!selectedDispute?.id) {
      setReconcileMessage('Select a dispute row again before signing the on-chain resolution.');
      return;
    }
    const caseId = String(selectedDispute.id);
    if (activeAddress !== CONTRACT_PLATFORM_TREASURY_WALLET) {
      setReconcileMessage('Connect the platform treasury wallet before signing the on-chain resolution.');
      return;
    }
    const tokenType = String(selectedDispute.token_type ?? '').toUpperCase();
    if (tokenType !== 'USDC' && tokenType !== 'SOL') {
      setReconcileMessage('On-chain dispute resolution needs a USDC or SOL invoice.');
      return;
    }
    if (creatorShareBps + clientShareBps !== 10000) {
      setReconcileMessage('Creator and client basis points must total 10000.');
      return;
    }

    setOnChainCaseId(caseId);
    setReconcileMessage(null);
    try {
      const token = await getAccessToken();
      let disputeForChain = selectedDispute;

      if (selectedDispute.status !== 'resolved') {
        const decisionRes = await fetch('/api/disputes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'resolve',
            caseId,
            adminWallet: activeAddress,
            decision: resolutionDecision,
            creatorShareBps,
            clientShareBps,
            verdictNote: resolutionNote,
          }),
        });
        const decisionData = await decisionRes.json();
        if (!decisionRes.ok) throw new Error(decisionData?.error || 'Final decision could not be recorded.');
        disputeForChain = { ...selectedDispute, ...(decisionData.dispute_case as Record<string, unknown>) };
        setSelectedDispute(disputeForChain);
      }

      const sdk = createAdminSdk();
      if (!sdk) throw new Error('Wallet not ready');
      const invoiceId = String(disputeForChain.invoice_id ?? '');
      const creatorWallet = String(disputeForChain.creator_wallet ?? '');
      const clientWallet = String(disputeForChain.client_wallet ?? '');
      if (!invoiceId || !creatorWallet || !clientWallet) {
        throw new Error('Missing invoice, creator, or client wallet for on-chain resolution.');
      }

      const verdictPayload = JSON.stringify({
        caseId,
        invoiceId,
        decision: resolutionDecision,
        creatorShareBps,
        clientShareBps,
        verdictNote: resolutionNote,
      });
      const verdictHash = await sha512Bytes(verdictPayload);
      const verdictResult = await sdk.storeVerdictHash(invoiceId, new PublicKey(creatorWallet), verdictHash);
      if (!verdictResult.success || !verdictResult.data) {
        throw new Error(verdictResult.error || 'Could not store verdict hash on-chain.');
      }

      const creatorPubkey = new PublicKey(creatorWallet);
      const clientPubkey = new PublicKey(clientWallet);
      const resolutionResult = tokenType === 'SOL'
        ? await sdk.resolveDisputeSol(invoiceId, creatorPubkey, clientPubkey, creatorShareBps, clientShareBps)
        : await sdk.resolveDispute(invoiceId, creatorPubkey, clientPubkey, creatorShareBps, clientShareBps);
      if (!resolutionResult.success || !resolutionResult.data) {
        throw new Error(resolutionResult.error || 'Could not resolve dispute on-chain.');
      }

      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'mark_onchain_resolved',
          caseId,
          adminWallet: activeAddress,
          verdictHashSignature: verdictResult.data.signature,
          resolutionSignature: resolutionResult.data.signature,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'On-chain signatures could not be recorded.');
      setReconcileMessage(`On-chain resolution signed: ${resolutionResult.data.signature.slice(0, 8)}...${resolutionResult.data.signature.slice(-8)}.`);
      await loadAdminData();
      setSelectedDispute({ ...disputeForChain, ...(data.dispute_case as Record<string, unknown>) });
    } catch (err) {
      setReconcileMessage(err instanceof Error ? err.message : 'On-chain resolution failed');
    } finally {
      setOnChainCaseId(null);
    }
  };

  const recommendDispute = async (row: Record<string, unknown>) => {
    if (!activeAddress) {
      setReconcileMessage('Admin wallet is not ready. Refresh the page after Privy finishes loading your wallet.');
      return;
    }
    if (!row.id) {
      setReconcileMessage('Select a dispute row again before generating a recommendation.');
      return;
    }
    const caseId = String(row.id);
    setRecommendationCaseId(caseId);
    setReconcileMessage(null);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'recommend', caseId, adminWallet: activeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Recommendation failed');
      setReconcileMessage(`Recommendation: ${data.recommendation?.decision ?? 'manual review'} (${data.recommendation?.confidence ?? 'low'} confidence).`);
      await loadAdminData();
    } catch (err) {
      setReconcileMessage(err instanceof Error ? err.message : 'Recommendation failed');
    } finally {
      setRecommendationCaseId(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <Header />
      <style>{`
        .admin-shell {
          width: min(1620px, calc(100vw - 48px));
          margin: 0 auto;
          padding: 44px 0 64px;
        }

        .admin-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: end;
          gap: 24px;
          margin-bottom: 28px;
        }

        .admin-title {
          color: ${colors.text};
          font-family: "Space Grotesk", sans-serif;
          font-size: clamp(2rem, 3vw, 3rem);
          font-weight: 700;
          line-height: 1;
          margin: 10px 0 16px;
        }

        .admin-subtitle {
          color: #A8C7ED;
          font-family: "DM Sans", sans-serif;
          font-size: 1.08rem;
          line-height: 1.55;
          max-width: 760px;
        }

        .admin-wallet-line {
          color: #6E86AD;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          margin-top: 12px;
        }

        .admin-role-badge {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 0 10px;
          margin-top: 14px;
          border-radius: 999px;
          border: 1px solid rgba(45, 212, 191, 0.32);
          background: rgba(45, 212, 191, 0.08);
          color: ${colors.teal};
          font-family: "DM Sans", sans-serif;
          font-size: 12px;
          font-weight: 700;
          text-transform: capitalize;
        }

        .admin-primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 48px;
          padding: 0 22px;
          border-radius: 8px;
          background: ${colors.teal};
          color: #071014;
          font-family: "DM Sans", sans-serif;
          font-size: 14px;
          font-weight: 700;
          border: 0;
          transition: background-color 160ms ease, transform 160ms ease;
        }

        .admin-primary-button:hover { background: #38E6D0; }
        .admin-primary-button:active { transform: translateY(1px); }
        .admin-primary-button:disabled { opacity: 0.65; cursor: not-allowed; }

        .admin-inline-button {
          min-height: 32px;
          padding: 0 10px;
          border-radius: 8px;
          border: 1px solid rgba(45, 212, 191, 0.34);
          background: rgba(45, 212, 191, 0.08);
          color: ${colors.teal};
          font-family: "DM Sans", sans-serif;
          font-size: 12px;
          font-weight: 700;
        }

        .admin-inline-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .admin-warning {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 12px;
          padding: 14px 16px;
          border: 1px solid rgba(252, 211, 77, 0.32);
          border-radius: 8px;
          background: rgba(252, 211, 77, 0.06);
          color: ${colors.amber};
          font-family: "DM Sans", sans-serif;
          font-size: 14px;
          line-height: 1.5;
        }

        .admin-error {
          padding: 14px 16px;
          border: 1px solid rgba(248, 113, 113, 0.35);
          border-radius: 8px;
          background: rgba(248, 113, 113, 0.06);
          color: ${colors.red};
          font-family: "DM Sans", sans-serif;
        }

        .admin-section-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .admin-muted-note {
          color: ${colors.dim};
          font-family: "DM Sans", sans-serif;
          font-size: 13px;
        }

        .admin-stat-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 14px;
          margin: 30px 0;
        }

        .admin-stat-card {
          min-height: 106px;
          padding: 16px;
          border-radius: 8px;
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          text-align: left;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
          transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
        }

        .admin-stat-card:hover {
          border-color: rgba(45, 212, 191, 0.34);
          background: #17202A;
        }

        .admin-stat-card:active {
          transform: translateY(1px);
        }

        .admin-stat-card-active {
          border-color: rgba(45, 212, 191, 0.62);
          background: rgba(45, 212, 191, 0.07);
          box-shadow: inset 0 0 0 1px rgba(45, 212, 191, 0.18);
        }

        .admin-section-tabs {
          display: flex;
          gap: 8px;
          padding: 8px;
          margin: -12px 0 18px;
          overflow-x: auto;
          overflow-y: hidden;
          touch-action: pan-x;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          border: 1px solid ${colors.border};
          border-radius: 8px;
          background: ${colors.surfaceSoft};
        }

        .admin-section-tab {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 36px;
          padding: 0 12px;
          border-radius: 8px;
          color: ${colors.muted};
          font-family: "DM Sans", sans-serif;
          font-size: 13px;
          font-weight: 700;
          border: 1px solid transparent;
          transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease;
        }

        .admin-section-tab:hover {
          color: ${colors.text};
          background: rgba(148, 163, 184, 0.07);
        }

        .admin-section-tab-active {
          color: ${colors.text};
          background: ${colors.surface};
          border-color: rgba(45, 212, 191, 0.42);
        }

        .admin-dispute-queue-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 0 0 14px;
        }

        .admin-dispute-queue-tab {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 8px;
          border: 1px solid ${colors.border};
          background: ${colors.surfaceSoft};
          color: ${colors.muted};
          font-family: "DM Sans", sans-serif;
          font-size: 12px;
          font-weight: 700;
          transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease;
        }

        .admin-dispute-queue-tab:hover {
          color: ${colors.text};
          border-color: rgba(148, 163, 184, 0.28);
        }

        .admin-dispute-queue-tab-active {
          color: ${colors.text};
          background: rgba(45, 212, 191, 0.08);
          border-color: rgba(45, 212, 191, 0.42);
        }

        .admin-dispute-queue-count {
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.10);
          border: 1px solid rgba(148, 163, 184, 0.14);
          color: inherit;
          font-family: "JetBrains Mono", monospace;
          font-size: 11px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .admin-stat-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .admin-stat-value {
          color: ${colors.text};
          font-family: "Space Grotesk", sans-serif;
          font-size: 1.85rem;
          font-weight: 700;
          line-height: 1;
          margin-top: 8px;
        }

        .admin-data-stack {
          display: grid;
          gap: 18px;
        }

        .admin-review-panel {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: 18px;
          padding: 20px;
          border-radius: 8px;
          background: ${colors.surface};
          border: 1px solid ${colors.border};
        }

        .admin-review-title {
          color: ${colors.text};
          font-family: "Space Grotesk", sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .admin-review-body {
          color: #C5D6F0;
          font-family: "DM Sans", sans-serif;
          font-size: 14px;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .admin-review-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin: 18px 0;
        }

        .admin-review-metric {
          padding: 14px;
          border-radius: 8px;
          border: 1px solid ${colors.borderSoft};
          background: ${colors.surfaceSoft};
        }

        .admin-form-stack {
          display: grid;
          gap: 12px;
        }

        .admin-field-label {
          color: #7890B5;
          font-family: "DM Sans", sans-serif;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .admin-input,
        .admin-select,
        .admin-textarea {
          width: 100%;
          border-radius: 8px;
          border: 1px solid ${colors.border};
          background: ${colors.surfaceSoft};
          color: ${colors.text};
          font-family: "DM Sans", sans-serif;
          font-size: 14px;
          padding: 10px 12px;
        }

        .admin-textarea {
          min-height: 110px;
          resize: vertical;
        }

        .admin-data-panel {
          overflow: hidden;
          border-radius: 8px;
          background: ${colors.surface};
          border: 1px solid ${colors.border};
        }

        .admin-data-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid ${colors.borderSoft};
        }

        .admin-data-panel-title {
          color: ${colors.text};
          font-family: "Space Grotesk", sans-serif;
          font-size: 1rem;
          font-weight: 700;
        }

        .admin-data-panel-count {
          min-width: 28px;
          height: 24px;
          padding: 0 9px;
          border-radius: 999px;
          background: ${colors.surfaceSoft};
          border: 1px solid ${colors.border};
          color: ${colors.muted};
          font-family: "JetBrains Mono", monospace;
          font-size: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .admin-table th {
          padding: 13px 20px;
          color: #7890B5;
          font-family: "DM Sans", sans-serif;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          background: ${colors.surfaceSoft};
          border-bottom: 1px solid ${colors.borderSoft};
        }

        .admin-table td {
          padding: 14px 20px;
          color: #D7E3F5;
          font-family: "DM Sans", sans-serif;
          font-size: 13px;
          border-bottom: 1px solid ${colors.borderSoft};
          white-space: nowrap;
        }

        .admin-table tr:last-child td { border-bottom: 0; }
        .admin-table tbody tr:hover td { background: rgba(45, 212, 191, 0.035); }

        .admin-mono-cell {
          font-family: "JetBrains Mono", monospace !important;
          font-size: 12px !important;
          color: #C5D6F0 !important;
        }

        .admin-empty-cell {
          padding: 22px 20px !important;
          color: ${colors.dim} !important;
          font-family: "DM Sans", sans-serif !important;
          font-size: 13px !important;
        }

        @media (max-width: 1180px) {
          .admin-stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }

        @media (max-width: 760px) {
          .admin-shell {
            width: min(100% - 32px, 680px);
            padding: 32px 0 48px;
          }

          .admin-hero {
            grid-template-columns: 1fr;
            align-items: stretch;
          }

          .admin-primary-button {
            width: 100%;
          }

          .admin-stat-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }

          .admin-stat-card {
            min-height: 98px;
            padding: 14px;
          }

          .admin-stat-value {
            font-size: 1.6rem;
          }

          .admin-review-panel {
            grid-template-columns: 1fr;
          }

          .admin-review-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <main className="admin-shell">
        <div className="admin-hero">
          <div>
            <p style={labelStyle}>Read-only operations</p>
            <h1 className="admin-title">Admin Dashboard</h1>
            <p className="admin-subtitle">Visibility across invoices, users, referrals, disputes, payouts, and email delivery.</p>
            <p className="admin-wallet-line">
              Connected wallet: {activeAddress.slice(0, 8)}...{activeAddress.slice(-8)} - On-chain treasury: {CONTRACT_PLATFORM_TREASURY_WALLET.slice(0, 8)}...{CONTRACT_PLATFORM_TREASURY_WALLET.slice(-8)}
            </p>
            {adminRole && <span className="admin-role-badge">{adminRole.replace('_', ' ')}</span>}
          </div>
          <button
            onClick={loadAdminData}
            disabled={loading}
            className="admin-primary-button"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        {overview?.warnings?.length ? (
          <div className="admin-warning">
            <ShieldAlert className="h-5 w-5 mt-0.5" />
            <div>
              <strong>Some admin sections could not be loaded.</strong>
              <span className="block mt-1">{overview.warnings.join('; ')}</span>
            </div>
          </div>
        ) : null}

        {loading && !overview ? (
          <div className="p-12 flex justify-center" style={panelStyle}>
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: colors.teal }} />
          </div>
        ) : (
          <>
            <div className="admin-stat-grid">
              {visibleSections.map(section => (
                <StatCard
                  key={section.id}
                  label={section.label}
                  value={summary[section.summaryKey]}
                  icon={section.icon}
                  accent={section.accent}
                  active={activeSection.id === section.id}
                  onClick={() => selectSection(section.id)}
                />
              ))}
            </div>

            <div className="admin-section-tabs" role="tablist" aria-label="Admin sections">
              {visibleSections.map(section => {
                const Icon = section.icon;
                const active = activeSection.id === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`admin-section-tab ${active ? 'admin-section-tab-active' : ''}`}
                    onClick={() => selectSection(section.id)}
                  >
                    <Icon className="h-4 w-4" />
                    {section.label}
                  </button>
                );
              })}
            </div>

            {activeSection.id === 'disputes' && adminRole === 'owner' && (
              <div className="admin-section-toolbar">
                <p className="admin-muted-note">{reconcileMessage || 'Backfill on-chain disputes that are missing from admin records.'}</p>
                <button
                  type="button"
                  className="admin-primary-button"
                  onClick={reconcileDisputes}
                  disabled={reconciling}
                >
                  {reconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Reconcile disputes
                </button>
              </div>
            )}

            {activeSection.id === 'disputes' && (
              <div className="admin-dispute-queue-tabs" role="tablist" aria-label="Dispute status">
                {disputeStatusFilters.map(filter => {
                  const active = disputeStatusFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`admin-dispute-queue-tab ${active ? 'admin-dispute-queue-tab-active' : ''}`}
                      onClick={() => selectDisputeStatusFilter(filter.id)}
                    >
                      {filter.label}
                      <span className="admin-dispute-queue-count">{disputeStatusCounts[filter.id]}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="admin-data-stack">
              <DataPanel
                title={activeSection.id === 'disputes'
                  ? `${activeSection.title} - ${disputeStatusFilters.find(filter => filter.id === disputeStatusFilter)?.label ?? 'Open'}`
                  : activeSection.title}
                rows={activeRows}
                columns={activeSection.columns}
                actionLabel={activeSection.id === 'disputes' && adminRole === 'owner' ? 'Review' : undefined}
                actionBusyId={recommendationCaseId}
                onAction={activeSection.id === 'disputes' && adminRole === 'owner' ? selectDispute : undefined}
              />

              {activeSection.id === 'disputes' && selectedDispute && adminRole === 'owner' && (
                <section className="admin-review-panel">
                  <div>
                    <p style={labelStyle}>Dispute review</p>
                    <h2 className="admin-review-title">{String(selectedDispute.invoice_id ?? 'Selected dispute')}</h2>
                    <div className="admin-review-grid">
                      <div className="admin-review-metric">
                        <p className="admin-field-label">Recommendation</p>
                        <p className="admin-stat-value" style={{ fontSize: '1.25rem' }}>{shortValue(selectedDispute.recommendation_decision)}</p>
                      </div>
                      <div className="admin-review-metric">
                        <p className="admin-field-label">Creator share</p>
                        <p className="admin-stat-value" style={{ fontSize: '1.25rem' }}>{shortValue(selectedDispute.recommendation_creator_bps)} bps</p>
                      </div>
                      <div className="admin-review-metric">
                        <p className="admin-field-label">Confidence</p>
                        <p className="admin-stat-value" style={{ fontSize: '1.25rem' }}>{shortValue(selectedDispute.recommendation_confidence)}</p>
                      </div>
                      <div className="admin-review-metric">
                        <p className="admin-field-label">Token</p>
                        <p className="admin-stat-value" style={{ fontSize: '1.25rem' }}>{shortValue(selectedDispute.token_type)}</p>
                      </div>
                      <div className="admin-review-metric">
                        <p className="admin-field-label">Final decision</p>
                        <p className="admin-stat-value" style={{ fontSize: '1.25rem' }}>{shortValue(selectedDispute.decision)}</p>
                      </div>
                      <div className="admin-review-metric">
                        <p className="admin-field-label">On-chain</p>
                        <p className="admin-stat-value" style={{ fontSize: '1.25rem' }}>{selectedDispute.onchain_resolved_at ? 'signed' : 'pending'}</p>
                      </div>
                    </div>
                    <p className="admin-field-label">Reasoning</p>
                    <p className="admin-review-body">{String(selectedDispute.recommendation_note || 'No recommendation has been generated yet.')}</p>
                    <div style={{ height: 16 }} />
                    <p className="admin-field-label">Risk flags</p>
                    <p className="admin-review-body">{String(selectedDispute.recommendation_risks || 'No risk flags recorded.')}</p>
                  </div>

                  <div className="admin-form-stack">
                    {reconcileMessage && (
                      <div className="admin-warning" role="status" aria-live="polite">
                        <ShieldAlert className="h-5 w-5 mt-0.5" />
                        <span>{reconcileMessage}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={() => recommendDispute(selectedDispute)}
                      disabled={
                        recommendationCaseId === String(selectedDispute.id) ||
                        selectedDispute.status === 'resolved' ||
                        Boolean(selectedDispute.onchain_resolved_at)
                      }
                    >
                      {recommendationCaseId === String(selectedDispute.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                      {selectedDispute.status === 'resolved' || selectedDispute.onchain_resolved_at ? 'Recommendation closed' : 'Generate recommendation'}
                    </button>

                    <label className="admin-form-stack">
                      <span className="admin-field-label">Final decision</span>
                      <select
                        className="admin-select"
                        value={resolutionDecision}
                        onChange={event => {
                          const next = event.target.value as 'creator' | 'client' | 'split';
                          setResolutionDecision(next);
                          if (next === 'creator') {
                            setCreatorShareBps(10000);
                            setClientShareBps(0);
                          } else if (next === 'client') {
                            setCreatorShareBps(0);
                            setClientShareBps(10000);
                          } else {
                            setCreatorShareBps(5000);
                            setClientShareBps(5000);
                          }
                        }}
                      >
                        <option value="creator">Creator</option>
                        <option value="client">Client</option>
                        <option value="split">Split</option>
                      </select>
                    </label>

                    <label className="admin-form-stack">
                      <span className="admin-field-label">Creator bps</span>
                      <input
                        className="admin-input"
                        type="number"
                        min={0}
                        max={10000}
                        value={creatorShareBps}
                        onChange={event => {
                          const next = Number(event.target.value);
                          setCreatorShareBps(next);
                          setClientShareBps(10000 - next);
                        }}
                      />
                    </label>

                    <label className="admin-form-stack">
                      <span className="admin-field-label">Client bps</span>
                      <input className="admin-input" type="number" min={0} max={10000} value={clientShareBps} onChange={event => setClientShareBps(Number(event.target.value))} />
                    </label>

                    <label className="admin-form-stack">
                      <span className="admin-field-label">Verdict note</span>
                      <textarea className="admin-textarea" value={resolutionNote} onChange={event => setResolutionNote(event.target.value)} />
                    </label>

                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={resolveDisputeOffchain}
                      disabled={resolvingCaseId === String(selectedDispute.id)}
                    >
                      {resolvingCaseId === String(selectedDispute.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                      Save decision only
                    </button>
                    <button
                      type="button"
                      className="admin-primary-button"
                      onClick={resolveDisputeOnChain}
                      disabled={onChainCaseId === String(selectedDispute.id) || Boolean(selectedDispute.onchain_resolved_at)}
                    >
                      {onChainCaseId === String(selectedDispute.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      Resolve and move funds
                    </button>
                    <p className="admin-muted-note">"Resolve and move funds" saves the decision if needed, then asks the treasury wallet to sign the on-chain split.</p>
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
