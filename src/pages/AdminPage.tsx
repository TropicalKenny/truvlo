import React, { useCallback, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Header from '@/components/Header';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { CONTRACT_PLATFORM_TREASURY_WALLET } from '@/lib/admin';
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
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; date?: boolean }>;
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="admin-empty-cell">
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
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<AdminSectionId>(() => getSectionFromHash());
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMessage, setReconcileMessage] = useState<string | null>(null);

  const activeAddress = activeWallet?.address ?? null;

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

  if (!ready) {
    return <div style={{ minHeight: '100vh', backgroundColor: colors.background }} />;
  }

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: colors.amber }} />
          <h1 style={{ color: colors.text, fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Admin access</h1>
          <p className="mt-3 mb-6" style={{ color: colors.muted, fontFamily: '"DM Sans", sans-serif' }}>Connect the admin wallet to view operations.</p>
          <button onClick={() => login()} className="admin-primary-button">Connect admin wallet</button>
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
  const activeRows = overview?.[activeSection.dataKey] ?? [];
  const adminRole = overview?.admin?.role ?? null;

  const selectSection = (sectionId: AdminSectionId) => {
    setActiveSectionId(sectionId);
    if (window.location.hash !== `#${sectionId}`) {
      window.history.replaceState(null, '', `#${sectionId}`);
    }
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

            <div className="admin-data-stack">
              <DataPanel
                title={activeSection.title}
                rows={activeRows}
                columns={activeSection.columns}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
