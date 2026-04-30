import React, { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Header from '@/components/Header';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { CONTRACT_PLATFORM_TREASURY_WALLET, WEB_ADMIN_WALLET_ADDRESS, isAdminWallet } from '@/lib/admin';
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

const colors = {
  background: '#0D1117',
  surface: '#141A22',
  surfaceSoft: '#10161E',
  border: 'rgba(148, 163, 184, 0.16)',
  borderSoft: 'rgba(148, 163, 184, 0.10)',
  text: '#F8FAFC',
  muted: '#94A3B8',
  dim: '#64748B',
  teal: '#2DD4BF',
  amber: '#FCD34D',
  red: '#FCA5A5',
};

const panelStyle: React.CSSProperties = {
  backgroundColor: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '10px',
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

const StatCard = ({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: unknown;
  icon: LucideIcon;
  accent: string;
}) => (
  <div className="admin-stat-card">
    <div className="admin-stat-icon" style={{ color: accent, backgroundColor: `${accent}18`, borderColor: `${accent}35` }}>
      <Icon className="h-4 w-4" />
    </div>
    <div>
      <p style={labelStyle}>{label}</p>
      <p className="admin-stat-value">{String(value ?? 0)}</p>
    </div>
  </div>
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

  const activeAddress = activeWallet?.address ?? null;
  const adminAllowed = useMemo(() => isAdminWallet(activeAddress), [activeAddress]);

  const loadAdminData = async () => {
    if (!adminAllowed || !activeAddress) return;
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
  };

  useEffect(() => {
    if (ready && authenticated && adminAllowed) {
      void loadAdminData();
    }
  }, [ready, authenticated, adminAllowed, activeAddress]);

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

  if (!adminAllowed) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: colors.red }} />
          <h1 style={{ color: colors.text, fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Unauthorized</h1>
          <p className="mt-3" style={{ color: colors.muted, fontFamily: '"DM Sans", sans-serif' }}>
            Switch to the admin wallet to view this page.
          </p>
          <p className="mt-4" style={{ color: colors.dim, fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
            Web admin wallet: {WEB_ADMIN_WALLET_ADDRESS.slice(0, 8)}...{WEB_ADMIN_WALLET_ADDRESS.slice(-8)}
          </p>
        </main>
      </div>
    );
  }

  const summary = overview?.summary ?? {};

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

        .admin-primary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 48px;
          padding: 0 22px;
          border-radius: 10px;
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
          border-radius: 10px;
          background: rgba(252, 211, 77, 0.06);
          color: ${colors.amber};
          font-family: "DM Sans", sans-serif;
          font-size: 14px;
          line-height: 1.5;
        }

        .admin-error {
          padding: 14px 16px;
          border: 1px solid rgba(248, 113, 113, 0.35);
          border-radius: 10px;
          background: rgba(248, 113, 113, 0.06);
          color: ${colors.red};
          font-family: "DM Sans", sans-serif;
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
          border-radius: 10px;
          background: ${colors.surface};
          border: 1px solid ${colors.border};
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 12px;
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
          border-radius: 10px;
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
              Web admin: {WEB_ADMIN_WALLET_ADDRESS.slice(0, 8)}...{WEB_ADMIN_WALLET_ADDRESS.slice(-8)} - On-chain treasury: {CONTRACT_PLATFORM_TREASURY_WALLET.slice(0, 8)}...{CONTRACT_PLATFORM_TREASURY_WALLET.slice(-8)}
            </p>
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
              <StatCard label="Invoices" value={summary.invoices} icon={FileText} accent={colors.teal} />
              <StatCard label="Profiles" value={summary.profiles} icon={Users} accent="#A8C7ED" />
              <StatCard label="Wallets" value={summary.wallets} icon={Wallet} accent="#60A5FA" />
              <StatCard label="Disputes" value={summary.disputes} icon={Gavel} accent={colors.amber} />
              <StatCard label="Email issues" value={summary.failed_emails} icon={MailWarning} accent={colors.red} />
              <StatCard label="Rewards" value={summary.referral_rewards} icon={Gift} accent="#34D399" />
              <StatCard label="Payouts" value={summary.payout_requests} icon={Banknote} accent="#C084FC" />
            </div>

            <div className="admin-data-stack">
              <DataPanel
                title="Recent Invoices"
                rows={overview?.invoices ?? []}
                columns={[
                  { key: 'invoice_id', label: 'Invoice' },
                  { key: 'sender_name', label: 'Creator name' },
                  { key: 'creator_wallet', label: 'Creator wallet' },
                  { key: 'client_wallet', label: 'Client wallet' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'token_type', label: 'Token' },
                  { key: 'created_at', label: 'Created', date: true },
                ]}
              />

              <DataPanel
                title="Disputes"
                rows={overview?.disputes ?? []}
                columns={[
                  { key: 'invoice_id', label: 'Invoice' },
                  { key: 'status', label: 'Status' },
                  { key: 'opened_by_role', label: 'Opened by' },
                  { key: 'creator_wallet', label: 'Creator' },
                  { key: 'client_wallet', label: 'Client' },
                  { key: 'opened_at', label: 'Opened', date: true },
                  { key: 'evidence_deadline_at', label: 'Deadline', date: true },
                ]}
              />

              <DataPanel
                title="Referral Rewards"
                rows={overview?.referral_rewards ?? []}
                columns={[
                  { key: 'invoice_id', label: 'Invoice' },
                  { key: 'source_role', label: 'Source' },
                  { key: 'referral_code', label: 'Code' },
                  { key: 'reward_amount', label: 'Reward' },
                  { key: 'token_type', label: 'Token' },
                  { key: 'status', label: 'Status' },
                  { key: 'created_at', label: 'Created', date: true },
                ]}
              />

              <DataPanel
                title="Payout Requests"
                rows={overview?.payout_requests ?? []}
                columns={[
                  { key: 'privy_id', label: 'Privy ID' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'token_type', label: 'Token' },
                  { key: 'status', label: 'Status' },
                  { key: 'payout_wallet', label: 'Wallet' },
                  { key: 'payout_cycle_date', label: 'Cycle' },
                  { key: 'requested_at', label: 'Requested', date: true },
                ]}
              />

              <DataPanel
                title="Email Delivery Issues"
                rows={overview?.failed_emails ?? []}
                columns={[
                  { key: 'invoice_id', label: 'Invoice' },
                  { key: 'sender_name', label: 'Creator name' },
                  { key: 'client_email', label: 'Client email' },
                  { key: 'amount', label: 'Amount' },
                  { key: 'token_type', label: 'Token' },
                  { key: 'created_at', label: 'Created', date: true },
                ]}
              />

              <DataPanel
                title="Recent Profiles"
                rows={overview?.profiles ?? []}
                columns={[
                  { key: 'display_name', label: 'Name' },
                  { key: 'notification_email', label: 'Email' },
                  { key: 'privy_id', label: 'Privy ID' },
                  { key: 'referral_code', label: 'Code' },
                  { key: 'onboarding_completed_at', label: 'Onboarded', date: true },
                  { key: 'created_at', label: 'Created', date: true },
                ]}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
