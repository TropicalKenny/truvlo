import React, { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import Header from '@/components/Header';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { CONTRACT_PLATFORM_TREASURY_WALLET, WEB_ADMIN_WALLET_ADDRESS, isAdminWallet } from '@/lib/admin';
import { Loader2, ShieldAlert, RefreshCw } from 'lucide-react';

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

const panelStyle: React.CSSProperties = {
  backgroundColor: '#161B22',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
};

const labelStyle: React.CSSProperties = {
  color: '#64748B',
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

const StatCard = ({ label, value }: { label: string; value: unknown }) => (
  <div className="p-4" style={panelStyle}>
    <p style={labelStyle}>{label}</p>
    <p style={{ color: '#F8FAFC', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', marginTop: '8px' }}>
      {String(value ?? 0)}
    </p>
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
  <section style={panelStyle}>
    <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <h2 style={{ color: '#F8FAFC', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1rem' }}>{title}</h2>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ minWidth: '720px' }}>
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} className="px-5 py-3" style={labelStyle}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-5 py-5" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '13px' }}>
                No records found.
              </td>
            </tr>
          ) : rows.map((row, index) => (
            <tr key={`${title}-${index}`} className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              {columns.map(column => (
                <td key={column.key} className="px-5 py-3" style={{ color: '#CBD5E1', fontFamily: column.key.includes('wallet') || column.key.includes('id') ? '"JetBrains Mono", monospace' : '"DM Sans", sans-serif', fontSize: '12px' }}>
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
    return <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }} />;
  }

  if (!authenticated) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: '#FCD34D' }} />
          <h1 style={{ color: '#F8FAFC', fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Admin access</h1>
          <p className="mt-3 mb-6" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>Connect the admin wallet to view operations.</p>
          <button onClick={() => login()} className="px-5 py-3 rounded-lg text-sm font-medium" style={{ backgroundColor: '#2DD4BF', color: '#0D1117', fontFamily: '"DM Sans", sans-serif' }}>Connect admin wallet</button>
        </main>
      </div>
    );
  }

  if (!adminAllowed) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }}>
        <Header />
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto mb-4" style={{ color: '#EF4444' }} />
          <h1 style={{ color: '#F8FAFC', fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700 }}>Unauthorized</h1>
          <p className="mt-3" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>
            Switch to the admin wallet to view this page.
          </p>
          <p className="mt-4" style={{ color: '#64748B', fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
            Web admin wallet: {WEB_ADMIN_WALLET_ADDRESS.slice(0, 8)}...{WEB_ADMIN_WALLET_ADDRESS.slice(-8)}
          </p>
        </main>
      </div>
    );
  }

  const summary = overview?.summary ?? {};

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }}>
      <Header />
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p style={labelStyle}>Read-only operations</p>
            <h1 style={{ color: '#F8FAFC', fontFamily: '"Space Grotesk", sans-serif', fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Admin Dashboard</h1>
            <p className="mt-2" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>Visibility across invoices, users, referrals, disputes, payouts, and email delivery.</p>
            <p className="mt-2" style={{ color: '#64748B', fontFamily: '"JetBrains Mono", monospace', fontSize: '11px' }}>
              Web admin: {WEB_ADMIN_WALLET_ADDRESS.slice(0, 8)}...{WEB_ADMIN_WALLET_ADDRESS.slice(-8)} · On-chain treasury: {CONTRACT_PLATFORM_TREASURY_WALLET.slice(0, 8)}...{CONTRACT_PLATFORM_TREASURY_WALLET.slice(-8)}
            </p>
          </div>
          <button
            onClick={loadAdminData}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: '#2DD4BF', color: '#0D1117', fontFamily: '"DM Sans", sans-serif' }}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-4" style={{ ...panelStyle, borderColor: 'rgba(239,68,68,0.35)', color: '#FCA5A5', fontFamily: '"DM Sans", sans-serif' }}>
            {error}
          </div>
        )}

        {overview?.warnings?.length ? (
          <div className="p-4" style={{ ...panelStyle, borderColor: 'rgba(252,211,77,0.35)', color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>
            Some admin sections could not be loaded: {overview.warnings.join('; ')}
          </div>
        ) : null}

        {loading && !overview ? (
          <div className="p-12 flex justify-center" style={panelStyle}>
            <Loader2 className="h-7 w-7 animate-spin" style={{ color: '#2DD4BF' }} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              <StatCard label="Invoices" value={summary.invoices} />
              <StatCard label="Profiles" value={summary.profiles} />
              <StatCard label="Wallets" value={summary.wallets} />
              <StatCard label="Disputes" value={summary.disputes} />
              <StatCard label="Email issues" value={summary.failed_emails} />
              <StatCard label="Rewards" value={summary.referral_rewards} />
              <StatCard label="Payouts" value={summary.payout_requests} />
            </div>

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
          </>
        )}
      </main>
    </div>
  );
};

export default AdminPage;
