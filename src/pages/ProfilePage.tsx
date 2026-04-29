import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import { ExternalLink, AlertCircle, Loader2, Shield, Zap, TrendingUp, Calendar, Info, Copy, Check } from 'lucide-react';
import { EscrowPaySDK, InvoiceData, InvoiceStatus } from '@/lib/escrowPaySDK';
import { getSolanaExplorerAddressUrl } from '@/lib/solanaConfig';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import TruvloLogo from '@/components/TruvloLogo';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getMemberSince(invoices: InvoiceData[]): string {
  if (!invoices.length) return 'â€”';
  const timestamps = invoices
    .map(i => { try { return i.createdAt.toNumber ? i.createdAt.toNumber() : Number(i.createdAt); } catch { return 0; } })
    .filter(t => t > 0);
  if (!timestamps.length) return 'â€”';
  return new Date(Math.min(...timestamps) * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getLongestCleanStreak(invoices: InvoiceData[]): number {
  const sorted = [...invoices].sort((a, b) => {
    const at = a.createdAt.toNumber ? a.createdAt.toNumber() : Number(a.createdAt);
    const bt = b.createdAt.toNumber ? b.createdAt.toNumber() : Number(b.createdAt);
    return at - bt;
  });
  let max = 0, current = 0;
  for (const inv of sorted) {
    if (inv.status === InvoiceStatus.Released && !inv.disputeRaisedAt) {
      current++; max = Math.max(max, current);
    } else if (inv.disputeRaisedAt) {
      current = 0;
    }
  }
  return max;
}

// â”€â”€ reputation score â€” deterministic, 0â€“1000 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Completion rate    40% â†’ up to 400 pts  (linear â€” based on rate, not count)
// Activity volume    20% â†’ up to 200 pts  (log scale â€” never plateaus)
// Best streak        20% â†’ up to 200 pts  (log scale â€” keeps rewarding consistency)
// Two-sided          10% â†’ up to 100 pts  (binary â€” used platform both ways)
// Dispute penalty   âˆ’10% â†’ up to âˆ’100 pts (50 per dispute, max 100 deducted)
//
// Log scale means 200 invoices scores better than 50 but not 4x better.
// The score approaches 1000 asymptotically â€” always a reason to do one more.

interface ScoreBreakdown {
  total: number;
  completionPts: number;
  activityPts: number;
  streakPts: number;
  twoSidedPts: number;
  disputePenalty: number;
}

function calcReputationScore(
  totalSent: number,
  cleanCompletions: number,
  longestStreak: number,
  totalPaid: number,
  disputedAsCreator: number,
  disputedAsClient: number,
): ScoreBreakdown {
  // 1. Completion rate â€” linear, based on rate not raw count (0â€“400)
  const completionRate = totalSent > 0 ? cleanCompletions / totalSent : 0;
  const completionPts = Math.round(completionRate * 400);

  // 2. Activity â€” log scale, reference point: 50 invoices â‰ˆ 150pts, 200 â‰ˆ 190pts (0â€“200)
  const totalActivity = totalSent + totalPaid;
  const activityPts = totalActivity > 0
    ? Math.round(Math.log(totalActivity + 1) / Math.log(202) * 200)
    : 0;

  // 3. Streak â€” log scale, reference point: 20 streak â‰ˆ 150pts, 100 â‰ˆ 190pts (0â€“200)
  const streakPts = longestStreak > 0
    ? Math.round(Math.log(longestStreak + 1) / Math.log(202) * 200)
    : 0;

  // 4. Two-sided participation â€” binary (0 or 100)
  const twoSidedPts = totalSent > 0 && totalPaid > 0 ? 100 : 0;

  // 5. Dispute penalty â€” 50pts per dispute, max 100 deducted
  const disputePenalty = Math.min((disputedAsCreator + disputedAsClient) * 50, 100);

  const total = Math.max(0, Math.min(1000, completionPts + activityPts + streakPts + twoSidedPts - disputePenalty));

  return { total, completionPts, activityPts, streakPts, twoSidedPts, disputePenalty };
}

// â”€â”€ read-only SDK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function createReadOnlySdk(connection: Connection): EscrowPaySDK | null {
  try {
    const mock: Wallet = {
      publicKey: new PublicKey('11111111111111111111111111111111'),
      signTransaction: async <T extends { serialize: () => Uint8Array }>(tx: T): Promise<T> => tx,
      signAllTransactions: async <T extends { serialize: () => Uint8Array }>(txs: T[]): Promise<T[]> => txs,
    };
    const provider = new AnchorProvider(connection, mock, { commitment: 'confirmed' });
    return new EscrowPaySDK(provider);
  } catch { return null; }
}

// â”€â”€ score ring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ScoreRing: React.FC<{ score: number }> = ({ score }) => {
  const size = 160;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - score / 1000);
  const color = score >= 800 ? '#2DD4BF' : score >= 500 ? '#38BDF8' : score >= 200 ? '#F59E0B' : '#EF4444';

  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '2.5rem', color, letterSpacing: '-0.03em', lineHeight: 1 }}>
          {score}
        </span>
        <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: '#64748B', marginTop: '4px' }}>
          / 1000
        </span>
      </div>
    </div>
  );
};

// â”€â”€ stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const StatCard = ({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) => (
  <div className="rounded-xl p-5 flex flex-col gap-1" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}>
    <p className="text-xs uppercase tracking-widest" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.08em' }}>
      {label}
    </p>
    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '2rem', color: accent ? '#2DD4BF' : '#F8FAFC', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
      {value}
    </p>
    {sub && <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '12px' }}>{sub}</p>}
  </div>
);

// â”€â”€ breakdown row â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const BreakdownRow = ({ label, pts, max, negative }: { label: string; pts: number; max: number; negative?: boolean }) => (
  <div className="flex items-center gap-3">
    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#94A3B8', minWidth: '170px', flexShrink: 0 }}>
      {label}
    </span>
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${(Math.abs(pts) / max) * 100}%`, backgroundColor: negative ? '#EF4444' : '#2DD4BF', transition: 'width 0.8s ease' }}
      />
    </div>
    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '12px', color: negative ? '#EF4444' : '#F8FAFC', minWidth: '56px', textAlign: 'right', flexShrink: 0 }}>
      {negative ? 'âˆ’' : '+'}{Math.abs(pts)} / {max}
    </span>
  </div>
);

// â”€â”€ session cache (cleared on tab close) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const profileCache = new Map<string, { data: ProfileData; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// â”€â”€ types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type LoadState = 'loading' | 'error' | 'loaded';

interface ProfileData {
  totalSent: number;
  cleanCompletions: number;
  disputedAsCreator: number;
  longestStreak: number;
  totalPaid: number;
  disputedAsClient: number;
  memberSince: string;
  walletAddress: string;
  score: ScoreBreakdown;
}

// â”€â”€ page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ProfilePage: React.FC = () => {
  const { wallet } = useParams<{ wallet: string }>();
  const { connection } = useConnection();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [copied, setCopied] = useState(false);

  const walletPubkey = useMemo(() => {
    if (!wallet) return null;
    try { return new PublicKey(wallet); } catch { return null; }
  }, [wallet]);

  useEffect(() => {
    if (!walletPubkey) { setError('Invalid wallet address.'); setLoadState('error'); return; }

    const cacheKey = walletPubkey.toBase58();
    const cached = profileCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setProfile(cached.data);
      setLoadState('loaded');
      return;
    }

    const load = async () => {
      setLoadState('loading');
      const sdk = createReadOnlySdk(connection);
      if (!sdk) { setError('Failed to connect to Solana.'); setLoadState('error'); return; }

      try {
        const [creatorResult, clientResult] = await Promise.all([
          sdk.fetchInvoicesByCreator(walletPubkey),
          sdk.fetchInvoicesByClient(walletPubkey),
        ]);

        const creatorInvoices: InvoiceData[] = creatorResult.success && creatorResult.data
          ? creatorResult.data.map(i => i.account) : [];
        const clientInvoices: InvoiceData[] = clientResult.success && clientResult.data
          ? clientResult.data.map(i => i.account) : [];

        const cleanCompletions = creatorInvoices.filter(i => i.status === InvoiceStatus.Released && !i.disputeRaisedAt).length;
        const disputedAsCreator = creatorInvoices.filter(i => !!i.disputeRaisedAt).length;
        const streak = getLongestCleanStreak(creatorInvoices);
        const disputedAsClient = clientInvoices.filter(i => !!i.disputeRaisedAt).length;

        const score = calcReputationScore(
          creatorInvoices.length, cleanCompletions, streak,
          clientInvoices.length, disputedAsCreator, disputedAsClient,
        );

        const data: ProfileData = {
          totalSent: creatorInvoices.length,
          cleanCompletions,
          disputedAsCreator,
          longestStreak: streak,
          totalPaid: clientInvoices.length,
          disputedAsClient,
          memberSince: getMemberSince([...creatorInvoices, ...clientInvoices]),
          walletAddress: walletPubkey.toBase58(),
          score,
        };
        profileCache.set(cacheKey, { data, fetchedAt: Date.now() });
        setProfile(data);
        setLoadState('loaded');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile.');
        setLoadState('error');
      }
    };

    load();
  }, [walletPubkey, connection]);

  // â”€â”€ loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loadState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D1117' }}>
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#2DD4BF' }} />
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>Reading on-chain data...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // â”€â”€ error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (loadState === 'error' || !profile) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D1117' }}>
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="rounded-xl p-10 text-center" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)', maxWidth: '400px', width: '100%' }}>
            <AlertCircle className="h-10 w-10 mx-auto mb-4" style={{ color: '#EF4444' }} />
            <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '1.125rem', color: '#F8FAFC', marginBottom: '8px' }}>
              Profile not found
            </h3>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '24px' }}>
              {error || 'No on-chain activity found for this wallet.'}
            </p>
            <Link to="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-opacity duration-150 hover:opacity-80"
              style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}>
              Go Home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasCreatorActivity = profile.totalSent > 0;
  const hasClientActivity = profile.totalPaid > 0;
  const hasAnyActivity = hasCreatorActivity || hasClientActivity;
  const completionRate = profile.totalSent > 0 ? Math.round((profile.cleanCompletions / profile.totalSent) * 100) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D1117' }}>
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-12">
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>

          {/* â”€â”€ Identity â”€â”€ */}
          <div className="flex items-start justify-between gap-4 mb-10">
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.08em' }}>
                Wallet Record
              </p>
              <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '1rem', color: '#F8FAFC', letterSpacing: '0.01em', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {profile.walletAddress}
              </p>
              {profile.memberSince !== 'â€”' && (
                <div className="flex items-center gap-2 mt-2">
                  <Calendar className="h-3 w-3" style={{ color: '#64748B' }} />
                  <span style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '12px' }}>
                    Active since {profile.memberSince}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <a
                href={getSolanaExplorerAddressUrl(profile.walletAddress)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-opacity duration-150 hover:opacity-70"
                style={{ backgroundColor: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
              >
                <ExternalLink className="h-3 w-3" />
                Verify on-chain
              </a>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch { /* ignore */ }
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all duration-150"
                style={{
                  backgroundColor: copied ? 'rgba(45,212,191,0.1)' : 'transparent',
                  border: copied ? '1px solid rgba(45,212,191,0.3)' : '1px solid rgba(255,255,255,0.1)',
                  color: copied ? '#2DD4BF' : '#94A3B8',
                  fontFamily: '"DM Sans", sans-serif',
                  cursor: 'pointer',
                }}
              >
                {copied
                  ? <><Check className="h-3 w-3" />Copied!</>
                  : <><Copy className="h-3 w-3" />Copy link</>}
              </button>
            </div>
          </div>

          {/* â”€â”€ No activity â”€â”€ */}
          {!hasAnyActivity && (
            <div className="rounded-xl p-12 text-center mb-8" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}>
              <TruvloLogo size="sm" className="mx-auto mb-4" />
              <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
                No on-chain escrow activity found for this wallet yet.
              </p>
            </div>
          )}

          {hasAnyActivity && (
            <>
              {/* â”€â”€ Reputation score â€” hero â”€â”€ */}
              <div
                className="rounded-xl p-8 mb-6 flex flex-col md:flex-row items-center gap-8"
                style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #2DD4BF' }}
              >
                <ScoreRing score={profile.score.total} />

                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#F8FAFC', letterSpacing: '-0.01em' }}>
                      Wallet Reputation
                    </p>
                    <button
                      onClick={() => setShowBreakdown(v => !v)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '2px', display: 'flex' }}
                      title="How is this calculated?"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#94A3B8', lineHeight: 1.6, marginBottom: '16px' }}>
                    Derived entirely from verified on-chain activity. Cannot be edited or faked.
                    Used for future token distribution and airdrop eligibility.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                    {profile.cleanCompletions > 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(45,212,191,0.1)', color: '#2DD4BF', fontFamily: '"DM Sans", sans-serif' }}>
                        <Shield className="h-3 w-3" />
                        {profile.cleanCompletions} clean completion{profile.cleanCompletions !== 1 ? 's' : ''}
                      </span>
                    )}
                    {profile.longestStreak >= 3 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(56,189,248,0.1)', color: '#38BDF8', fontFamily: '"DM Sans", sans-serif' }}>
                        <Zap className="h-3 w-3" />
                        {profile.longestStreak} streak
                      </span>
                    )}
                    {profile.disputedAsCreator === 0 && profile.disputedAsClient === 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ADE80', fontFamily: '"DM Sans", sans-serif' }}>
                        Zero disputes
                      </span>
                    )}
                    {profile.score.twoSidedPts === 100 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#FB923C', fontFamily: '"DM Sans", sans-serif' }}>
                        Two-sided
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* â”€â”€ Breakdown (expandable via â„¹ï¸ button) â”€â”€ */}
              {showBreakdown && (
                <div className="rounded-xl p-6 mb-6 space-y-3" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '13px', color: '#F8FAFC', marginBottom: '16px' }}>
                    How the score is calculated
                  </p>
                  <BreakdownRow label="Completion rate (Ã—400)" pts={profile.score.completionPts} max={400} />
                  <BreakdownRow label="Activity volume (Ã—200)" pts={profile.score.activityPts} max={200} />
                  <BreakdownRow label="Best streak (Ã—200)" pts={profile.score.streakPts} max={200} />
                  <BreakdownRow label="Two-sided (Ã—100)" pts={profile.score.twoSidedPts} max={100} />
                  {profile.score.disputePenalty > 0 && (
                    <BreakdownRow label="Dispute penalty (Ã—100)" pts={profile.score.disputePenalty} max={100} negative />
                  )}
                  <div className="flex justify-between pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#94A3B8' }}>Total</span>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '13px', color: '#2DD4BF' }}>
                      {profile.score.total} / 1000
                    </span>
                  </div>
                </div>
              )}

              {/* â”€â”€ As Creator â”€â”€ */}
              {hasCreatorActivity && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="h-4 w-4" style={{ color: '#94A3B8' }} />
                    <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '1rem', color: '#F8FAFC' }}>As Creator</h2>
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Clean completions" value={profile.cleanCompletions} sub={`of ${profile.totalSent} sent`} accent={profile.cleanCompletions > 0} />
                    <StatCard label="Completion rate" value={completionRate !== null ? `${completionRate}%` : 'â€”'} sub={profile.disputedAsCreator > 0 ? `${profile.disputedAsCreator} disputed` : 'No disputes'} />
                    <StatCard label="Best streak" value={profile.longestStreak} sub="dispute-free in a row" />
                  </div>
                </div>
              )}

              {/* â”€â”€ As Client â”€â”€ */}
              {hasClientActivity && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="h-4 w-4" style={{ color: '#94A3B8' }} />
                    <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '1rem', color: '#F8FAFC' }}>As Client</h2>
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Invoices paid" value={profile.totalPaid} sub="via escrow" />
                    <StatCard label="Disputes raised" value={profile.disputedAsClient} sub={profile.disputedAsClient === 0 ? 'Clean record' : 'as client'} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* â”€â”€ Verification footer â”€â”€ */}
          <div className="rounded-xl p-5 flex items-start gap-4" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(45,212,191,0.1)' }}>
              <Shield className="h-4 w-4" style={{ color: '#2DD4BF' }} />
            </div>
            <div>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500, fontSize: '13px', color: '#F8FAFC', marginBottom: '4px' }}>
                This record is verified on-chain
              </p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#64748B', lineHeight: 1.6 }}>
                Every figure here is derived from one wallet's on-chain activity.
                For pooled account reputation across linked wallets, open the{' '}
                <Link to="/account" style={{ color: '#2DD4BF', textDecoration: 'none' }}>
                  Account page
                </Link>{' '}
                instead. {' '}
                <a href={getSolanaExplorerAddressUrl(profile.walletAddress)}
                  target="_blank" rel="noopener noreferrer" style={{ color: '#2DD4BF', textDecoration: 'none' }}>
                  Verify yourself →
                </a>
              </p>
            </div>
          </div>

          {/* â”€â”€ Wallet match warning â”€â”€ */}
          <div
            className="rounded-xl p-4 flex items-start gap-3 mt-3"
            style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#94A3B8', lineHeight: 1.6 }}>
              <span style={{ color: '#F8FAFC', fontWeight: 500 }}>Always verify the wallet address matches. </span>
              This page is public and wallet-specific. Before paying an invoice, confirm the wallet shown here
              matches the one on the invoice you received. For pooled account reputation, use the Account page.
            </p>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ProfilePage;
