import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import { ExternalLink, AlertCircle, Loader2, Shield, Zap, TrendingUp, Info, Copy, Check } from 'lucide-react';
import { EscrowPaySDK, InvoiceData, InvoiceStatus, TokenType } from '@/lib/escrowPaySDK';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

// ── helpers (mirrored from ProfilePage) ────────────────────────

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

function getMemberSince(invoices: InvoiceData[]): string {
  if (!invoices.length) return '—';
  const timestamps = invoices
    .map(i => { try { return i.createdAt.toNumber ? i.createdAt.toNumber() : Number(i.createdAt); } catch { return 0; } })
    .filter(t => t > 0);
  if (!timestamps.length) return '—';
  return new Date(Math.min(...timestamps) * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

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
  const completionRate = totalSent > 0 ? cleanCompletions / totalSent : 0;
  const completionPts = Math.round(completionRate * 400);
  const totalActivity = totalSent + totalPaid;
  const activityPts = totalActivity > 0
    ? Math.round(Math.log(totalActivity + 1) / Math.log(202) * 200) : 0;
  const streakPts = longestStreak > 0
    ? Math.round(Math.log(longestStreak + 1) / Math.log(202) * 200) : 0;
  const twoSidedPts = totalSent > 0 && totalPaid > 0 ? 100 : 0;
  const disputePenalty = Math.min((disputedAsCreator + disputedAsClient) * 50, 100);
  const total = Math.max(0, Math.min(1000, completionPts + activityPts + streakPts + twoSidedPts - disputePenalty));
  return { total, completionPts, activityPts, streakPts, twoSidedPts, disputePenalty };
}

function createReadOnlySdk(connection: Connection): EscrowPaySDK | null {
  try {
    const mock = {
      publicKey: new PublicKey('11111111111111111111111111111111'),
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any[]) => txs,
    };
    const provider = new AnchorProvider(connection, mock as any, { commitment: 'confirmed' });
    return new EscrowPaySDK(provider);
  } catch { return null; }
}

// ── per-wallet session cache ───────────────────────────────────

const walletCache = new Map<string, { creator: any[]; client: any[]; fetchedAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── score ring ─────────────────────────────────────────────────

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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
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

const BreakdownRow = ({ label, pts, max, negative }: { label: string; pts: number; max: number; negative?: boolean }) => (
  <div className="flex items-center gap-3">
    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#94A3B8', minWidth: '170px', flexShrink: 0 }}>
      {label}
    </span>
    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <div className="h-full rounded-full"
        style={{ width: `${(Math.abs(pts) / max) * 100}%`, backgroundColor: negative ? '#EF4444' : '#2DD4BF', transition: 'width 0.8s ease' }} />
    </div>
    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '12px', color: negative ? '#EF4444' : '#F8FAFC', minWidth: '56px', textAlign: 'right', flexShrink: 0 }}>
      {negative ? '−' : '+'}{Math.abs(pts)} / {max}
    </span>
  </div>
);

// ── page ───────────────────────────────────────────────────────

type LoadState = 'loading' | 'error' | 'loaded';

const CombinedProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { connection } = useConnection();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [walletAddresses, setWalletAddresses] = useState<string[]>([]);
  const [score, setScore] = useState<ScoreBreakdown | null>(null);
  const [totalSent, setTotalSent] = useState(0);
  const [cleanCompletions, setCleanCompletions] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [disputedAsCreator, setDisputedAsCreator] = useState(0);
  const [disputedAsClient, setDisputedAsClient] = useState(0);
  const [memberSince, setMemberSince] = useState('—');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) { setErrorMsg('Invalid profile link.'); setLoadState('error'); return; }

    const load = async () => {
      setLoadState('loading');

      // 1. Fetch wallet addresses from API
      let addresses: string[] = [];
      let name: string | null = null;
      try {
        const res = await fetch(`/api/combined-profile?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) {
          setErrorMsg(res.status === 404 ? 'Profile not found.' : 'Failed to load profile.');
          setLoadState('error');
          return;
        }
        const data = await res.json();
        addresses = data.wallet_addresses ?? [];
        name = data.display_name ?? null;
      } catch {
        setErrorMsg('Failed to load profile.');
        setLoadState('error');
        return;
      }

      setDisplayName(name);
      setWalletAddresses(addresses);

      if (addresses.length === 0) {
        setLoadState('loaded');
        return;
      }

      // 2. Fetch on-chain data for all wallets
      const sdk = createReadOnlySdk(connection);
      if (!sdk) { setErrorMsg('Failed to connect to Solana.'); setLoadState('error'); return; }

      try {
        // Fetch all wallets in parallel (with per-wallet cache)
        const results = await Promise.all(
          addresses.map(async addr => {
            const cached = walletCache.get(addr);
            if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
              return { creator: cached.creator, client: cached.client };
            }
            let pubkey: PublicKey;
            try { pubkey = new PublicKey(addr); } catch { return { creator: [], client: [] }; }
            const [cr, cl] = await Promise.all([
              sdk.fetchInvoicesByCreator(pubkey),
              sdk.fetchInvoicesByClient(pubkey),
            ]);
            const creator = cr.success && cr.data ? cr.data : [];
            const client = cl.success && cl.data ? cl.data : [];
            walletCache.set(addr, { creator, client, fetchedAt: Date.now() });
            return { creator, client };
          })
        );

        // 3. Pool + deduplicate by invoice public key
        const seenIds = new Set<string>();
        const allCreator: InvoiceData[] = [];
        const allClient: InvoiceData[] = [];

        for (const { creator, client } of results) {
          for (const item of creator) {
            const id = item.publicKey.toBase58();
            if (!seenIds.has(id)) { seenIds.add(id); allCreator.push(item.account); }
          }
          for (const item of client) {
            const id = item.publicKey.toBase58();
            if (!seenIds.has(id)) { seenIds.add(id); allClient.push(item.account); }
          }
        }

        // 4. Calculate combined stats
        const cleanC = allCreator.filter(i => i.status === InvoiceStatus.Released && !i.disputeRaisedAt).length;
        const dispCreator = allCreator.filter(i => !!i.disputeRaisedAt).length;
        const streak = getLongestCleanStreak(allCreator);
        const dispClient = allClient.filter(i => !!i.disputeRaisedAt).length;
        const combined = calcReputationScore(allCreator.length, cleanC, streak, allClient.length, dispCreator, dispClient);
        const since = getMemberSince([...allCreator, ...allClient]);

        setTotalSent(allCreator.length);
        setCleanCompletions(cleanC);
        setLongestStreak(streak);
        setTotalPaid(allClient.length);
        setDisputedAsCreator(dispCreator);
        setDisputedAsClient(dispClient);
        setMemberSince(since);
        setScore(combined);
        setLoadState('loaded');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Failed to load on-chain data.');
        setLoadState('error');
      }
    };

    load();
  }, [slug, connection]);

  // ── loading ──────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D1117' }}>
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: '#2DD4BF' }} />
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>Loading combined reputation...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── error ────────────────────────────────────────────────────
  if (loadState === 'error') {
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
              {errorMsg}
            </p>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', textDecoration: 'none' }}>
              Go Home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasActivity = totalSent > 0 || totalPaid > 0;
  const completionRate = totalSent > 0 ? Math.round((cleanCompletions / totalSent) * 100) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#0D1117' }}>
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-12">
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>

          {/* ── Identity ── */}
          <div className="flex items-start justify-between gap-4 mb-10">
            <div>
              <p className="text-xs uppercase tracking-widest mb-2" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', letterSpacing: '0.08em' }}>
                Combined Escrow Record
              </p>
              {displayName && (
                <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#F8FAFC', letterSpacing: '-0.02em', marginBottom: '4px' }}>
                  {displayName}
                </h1>
              )}
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B' }}>
                {walletAddresses.length} linked wallet{walletAddresses.length !== 1 ? 's' : ''} · all on-chain activity pooled
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch { /* ignore */ }
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs transition-all duration-150 flex-shrink-0"
              style={{
                backgroundColor: copied ? 'rgba(45,212,191,0.1)' : 'transparent',
                border: copied ? '1px solid rgba(45,212,191,0.3)' : '1px solid rgba(255,255,255,0.1)',
                color: copied ? '#2DD4BF' : '#94A3B8',
                fontFamily: '"DM Sans", sans-serif', cursor: 'pointer',
              }}
            >
              {copied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy link</>}
            </button>
          </div>

          {/* ── No activity ── */}
          {!hasActivity && (
            <div className="rounded-xl p-12 text-center mb-8" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
                No on-chain escrow activity found for these wallets yet.
              </p>
            </div>
          )}

          {hasActivity && score && (
            <>
              {/* ── Reputation score ── */}
              <div
                className="rounded-xl p-8 mb-6 flex flex-col md:flex-row items-center gap-8"
                style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '4px solid #2DD4BF' }}
              >
                <ScoreRing score={score.total} />
                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#F8FAFC', letterSpacing: '-0.01em' }}>
                      Combined Reputation Score
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
                    Pooled across all {walletAddresses.length} linked wallet{walletAddresses.length !== 1 ? 's' : ''}. Derived from verified on-chain activity. Cannot be edited or faked.
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                    {cleanCompletions > 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(45,212,191,0.1)', color: '#2DD4BF', fontFamily: '"DM Sans", sans-serif' }}>
                        <Shield className="h-3 w-3" />
                        {cleanCompletions} clean completion{cleanCompletions !== 1 ? 's' : ''}
                      </span>
                    )}
                    {longestStreak >= 3 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(56,189,248,0.1)', color: '#38BDF8', fontFamily: '"DM Sans", sans-serif' }}>
                        <Zap className="h-3 w-3" />
                        {longestStreak} streak
                      </span>
                    )}
                    {disputedAsCreator === 0 && disputedAsClient === 0 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ADE80', fontFamily: '"DM Sans", sans-serif' }}>
                        Zero disputes
                      </span>
                    )}
                    {score.twoSidedPts === 100 && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                        style={{ backgroundColor: 'rgba(249,115,22,0.1)', color: '#FB923C', fontFamily: '"DM Sans", sans-serif' }}>
                        Two-sided
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Breakdown ── */}
              {showBreakdown && (
                <div className="rounded-xl p-6 mb-6 space-y-3" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '13px', color: '#F8FAFC', marginBottom: '16px' }}>
                    How the score is calculated
                  </p>
                  <BreakdownRow label="Completion rate (×400)" pts={score.completionPts} max={400} />
                  <BreakdownRow label="Activity volume (×200)" pts={score.activityPts} max={200} />
                  <BreakdownRow label="Best streak (×200)" pts={score.streakPts} max={200} />
                  <BreakdownRow label="Two-sided (×100)" pts={score.twoSidedPts} max={100} />
                  {score.disputePenalty > 0 && (
                    <BreakdownRow label="Dispute penalty (×100)" pts={score.disputePenalty} max={100} negative />
                  )}
                  <div className="flex justify-between pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                    <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#94A3B8' }}>Total</span>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '13px', color: '#2DD4BF' }}>
                      {score.total} / 1000
                    </span>
                  </div>
                </div>
              )}

              {/* ── Creator stats ── */}
              {totalSent > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <TrendingUp className="h-4 w-4" style={{ color: '#94A3B8' }} />
                    <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '1rem', color: '#F8FAFC' }}>As Creator</h2>
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <StatCard label="Clean completions" value={cleanCompletions} sub={`of ${totalSent} sent`} accent={cleanCompletions > 0} />
                    <StatCard label="Completion rate" value={completionRate !== null ? `${completionRate}%` : '—'} sub={disputedAsCreator > 0 ? `${disputedAsCreator} disputed` : 'No disputes'} />
                    <StatCard label="Best streak" value={longestStreak} sub="dispute-free in a row" />
                  </div>
                </div>
              )}

              {/* ── Client stats ── */}
              {totalPaid > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Shield className="h-4 w-4" style={{ color: '#94A3B8' }} />
                    <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 500, fontSize: '1rem', color: '#F8FAFC' }}>As Client</h2>
                    <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <StatCard label="Invoices paid" value={totalPaid} sub="via escrow" />
                    <StatCard label="Disputes raised" value={disputedAsClient} sub={disputedAsClient === 0 ? 'Clean record' : 'as client'} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Linked wallets ── */}
          <div className="rounded-xl p-6 mb-4" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: '0.9rem', color: '#F8FAFC', marginBottom: '4px' }}>
              Verified wallets
            </p>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#64748B', marginBottom: '14px' }}>
              Each can be independently checked on-chain.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {walletAddresses.map(addr => (
                <div key={addr} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', backgroundColor: '#1C2128', borderRadius: '8px', padding: '10px 14px' }}>
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#94A3B8', wordBreak: 'break-all', flex: 1 }}>
                    {addr}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <Link
                      to={`/profile/${addr}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#2DD4BF', textDecoration: 'none' }}
                    >
                      <ExternalLink size={12} />
                      View profile
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Verification footer ── */}
          <div className="rounded-xl p-5 flex items-start gap-4" style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(45,212,191,0.1)' }}>
              <Shield className="h-4 w-4" style={{ color: '#2DD4BF' }} />
            </div>
            <div>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 500, fontSize: '13px', color: '#F8FAFC', marginBottom: '4px' }}>
                This record is verified on-chain
              </p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#64748B', lineHeight: 1.6 }}>
                Every figure is derived directly from the Truvlo smart contract on Solana.
                No wallet connection required to view. Click any wallet above to verify it individually.
              </p>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default CombinedProfilePage;
