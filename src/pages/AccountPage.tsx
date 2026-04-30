import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { AuthProfile, useAuthProfile } from '@/contexts/AuthProfileContext';
import Header from '@/components/Header';
import { useToast } from '@/hooks/use-toast';
import { formatTokenAmountValue } from '@/lib/amountFormat';
import { Check, Copy, ExternalLink, Loader2, Wallet, ArrowRight } from 'lucide-react';

type TokenType = 'USDC' | 'SOL';

type RewardStatus = 'pending' | 'matured' | 'requestable' | 'requested' | 'scheduled' | 'paid' | 'rejected';

interface PayoutRequestSummary {
  id: string;
  token_type: TokenType;
  amount: number;
  status: RewardStatus;
  payout_cycle_date: string | null;
  request_deadline: string | null;
  requested_at: string | null;
  processed_at: string | null;
  admin_note: string | null;
}

interface ReferralRewardSummary {
  pending: number;
  matured: number;
  requestable: number;
  requested: number;
  scheduled: number;
  paid: number;
  rejected: number;
}

interface ReferralPanelData {
  profile: AuthProfile | null;
  summary: Record<TokenType, ReferralRewardSummary>;
  payout_requests: PayoutRequestSummary[];
}

const cardStyle: React.CSSProperties = {
  backgroundColor: '#161B22',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
};

const labelStyle: React.CSSProperties = {
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '12px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#64748B',
};

const valueStyle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 700,
  color: '#F8FAFC',
  letterSpacing: '-0.02em',
};

const AccountPage: React.FC = () => {
  const { authenticated, ready, getAccessToken } = usePrivy();
  const { profile } = useAuthProfile();
  const { allWallets, activeWallet } = useActiveWallet();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [referrals, setReferrals] = useState<ReferralPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedReputation, setCopiedReputation] = useState(false);

  const responseError = async (res: Response, fallback: string) => {
    try {
      const data = await res.json() as { error?: string };
      return data.error ? `${fallback}: ${data.error}` : `${fallback}: HTTP ${res.status}`;
    } catch {
      return `${fallback}: HTTP ${res.status}`;
    }
  };

  useEffect(() => {
    if (ready && !authenticated) {
      navigate('/', { replace: true });
    }
  }, [authenticated, navigate, ready]);

  useEffect(() => {
    if (!ready || !authenticated) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setReferralError(null);

      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;

        const referralsRes = await fetch('/api/referrals', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (referralsRes.ok) {
          const data = await referralsRes.json() as ReferralPanelData;
          if (!cancelled) setReferrals(data);
        } else if (!cancelled) {
          setReferralError(await responseError(referralsRes, 'Rewards load failed'));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load account data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, ready]);

  const inviteLink = profile?.referral_code ? `${window.location.origin}/?ref=${profile.referral_code}` : '';
  const reputationLink = profile?.profile_slug ? `${window.location.origin}/profile/account/${profile.profile_slug}` : '';
  const latestPayout = referrals?.payout_requests?.[0] ?? null;
  const summary = referrals?.summary ?? {
    USDC: { pending: 0, matured: 0, requestable: 0, requested: 0, scheduled: 0, paid: 0, rejected: 0 },
    SOL: { pending: 0, matured: 0, requestable: 0, requested: 0, scheduled: 0, paid: 0, rejected: 0 },
  };

  const copy = async (value: string, done: () => void) => {
    try {
      await navigator.clipboard.writeText(value);
      done();
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }}>
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-8">
          <div>
            <p style={labelStyle}>Account</p>
            <h1 style={{ ...valueStyle, fontSize: '2.25rem', lineHeight: 1.1, marginTop: '6px' }}>
              Your control center
            </h1>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '14px', color: '#64748B', marginTop: '8px' }}>
              Profile, wallets, referral link, payouts, and reputation live here. Dashboard stays invoice-first.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
            >
              Profile settings
            </Link>
            <Link
              to="/wallet"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#F8FAFC', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
            >
              <Wallet className="h-4 w-4" />
              Wallets
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl px-4 py-3" style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#FCD34D', fontSize: '13px' }}>{error}</p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
            <section style={cardStyle} className="p-5">
              <p style={labelStyle}>Profile basics</p>
              <div className="mt-3 space-y-4">
                <div>
                  <p style={labelStyle}>Display name</p>
                  <p style={{ ...valueStyle, fontSize: '1.4rem', marginTop: '4px' }}>{profile?.display_name || 'Not set yet'}</p>
                </div>
                <div>
                  <p style={labelStyle}>Default token</p>
                  <p style={{ ...valueStyle, fontSize: '1.1rem', marginTop: '4px' }}>{profile?.default_token || 'USDC'}</p>
                </div>
                <div>
                  <p style={labelStyle}>Notification email</p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', marginTop: '4px' }}>{profile?.notification_email || 'Not configured'}</p>
                </div>
              </div>
            </section>

            <section style={cardStyle} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p style={labelStyle}>Referral link</p>
                  <p style={{ ...valueStyle, fontSize: '1.4rem', marginTop: '4px' }}>{profile?.referral_code || 'Generating…'}</p>
                </div>
                <button
                  type="button"
                  disabled={!profile?.referral_code}
                  onClick={async () => {
                    if (!profile?.referral_code) return;
                    await copy(profile.referral_code, () => {
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1500);
                    });
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{
                    backgroundColor: copiedCode ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.04)',
                    color: copiedCode ? '#2DD4BF' : '#F8FAFC',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: profile?.referral_code ? 'pointer' : 'default',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  {copiedCode ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copiedCode ? 'Copied' : 'Copy code'}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <p style={labelStyle}>Invite link</p>
                  <div className="mt-2 flex gap-2">
                    <div className="flex-1 rounded-xl px-3 py-3" style={{ backgroundColor: '#1C2128', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <p style={{ fontFamily: '"JetBrains Mono", monospace', color: '#F8FAFC', fontSize: '13px', wordBreak: 'break-all' }}>
                        {inviteLink || 'Your link appears after code generation'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!inviteLink}
                      onClick={async () => {
                        if (!inviteLink) return;
                        await copy(inviteLink, () => {
                          setCopiedInvite(true);
                          setTimeout(() => setCopiedInvite(false), 1500);
                        });
                      }}
                      className="px-3 rounded-xl text-sm font-medium"
                      style={{
                        backgroundColor: copiedInvite ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.04)',
                        color: copiedInvite ? '#2DD4BF' : '#F8FAFC',
                        border: '1px solid rgba(255,255,255,0.08)',
                        fontFamily: '"DM Sans", sans-serif',
                      }}
                    >
                      {copiedInvite ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                </div>

                <div>
                  <p style={labelStyle}>Referred by</p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', marginTop: '4px' }}>
                    {profile?.referred_by_code || 'No referrer recorded yet'}
                  </p>
                </div>
                <div>
                  <p style={labelStyle}>Captured at</p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', marginTop: '4px' }}>
                    {profile?.referral_linked_at ? new Date(profile.referral_linked_at).toLocaleString() : 'Not yet linked'}
                  </p>
                </div>
              </div>
            </section>

            <section style={cardStyle} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p style={labelStyle}>Connected wallets</p>
                  <p style={{ ...valueStyle, fontSize: '1.4rem', marginTop: '4px' }}>{allWallets.length} linked</p>
                </div>
                <Link
                  to="/wallet"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#F8FAFC', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
                >
                  Wallet page
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-4 space-y-2">
                {allWallets.length === 0 ? (
                  <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#64748B', fontSize: '14px' }}>
                    No wallets connected yet.
                  </p>
                ) : (
                  allWallets.map(wallet => {
                    const active = wallet.address === activeWallet?.address;
                    return (
                      <div
                        key={wallet.address}
                        className="flex items-center justify-between rounded-xl px-3 py-2.5"
                        style={{
                          backgroundColor: active ? 'rgba(45,212,191,0.06)' : '#1C2128',
                          border: `1px solid ${active ? 'rgba(45,212,191,0.18)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        <p style={{ fontFamily: '"JetBrains Mono", monospace', color: '#F8FAFC', fontSize: '13px' }}>
                          {`${wallet.address.slice(0, 6)}...${wallet.address.slice(-6)}`}
                        </p>
                        <span style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: active ? '#2DD4BF' : '#64748B' }}>
                          {active ? 'Active' : 'Linked'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section style={cardStyle} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p style={labelStyle}>Public reputation</p>
                  <p style={{ ...valueStyle, fontSize: '1.4rem', marginTop: '4px' }}>
                    {profile?.profile_slug ? 'Public profile ready' : 'Create a wallet to publish'}
                  </p>
                </div>
                {reputationLink && (
                  <button
                    type="button"
                    onClick={async () => {
                      await copy(reputationLink, () => {
                        setCopiedReputation(true);
                        setTimeout(() => setCopiedReputation(false), 1500);
                      });
                    }}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{
                      backgroundColor: copiedReputation ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.04)',
                      color: copiedReputation ? '#2DD4BF' : '#F8FAFC',
                      border: '1px solid rgba(255,255,255,0.08)',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    {copiedReputation ? <Check className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                    {copiedReputation ? 'Copied' : 'Copy link'}
                  </button>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '14px', lineHeight: 1.6 }}>
                  Your reputation page aggregates invoice history across every wallet linked to this account.
                  It is the public record you can share with clients.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  {profile?.profile_slug ? (
                    <Link
                      to={`/profile/account/${profile.profile_slug}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: '#2DD4BF', color: '#0D1117', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
                    >
                      Open reputation page
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  ) : (
                    <Link
                      to="/wallet"
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: '#2DD4BF', color: '#0D1117', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
                    >
                      Register a wallet
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <section style={cardStyle} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p style={labelStyle}>Rewards</p>
                  <p style={{ ...valueStyle, fontSize: '1.4rem', marginTop: '4px' }}>Payout queue</p>
                </div>
                <span className="rounded-full px-3 py-1 text-xs" style={{ backgroundColor: 'rgba(45,212,191,0.12)', color: '#2DD4BF', fontFamily: '"DM Sans", sans-serif' }}>
                  Manual cycle
                </span>
              </div>

              {loading && !referrals ? (
                <div className="mt-4 flex items-center gap-2" style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '13px' }}>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading rewards...
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {(['USDC', 'SOL'] as const).map(tokenType => {
                    const bucket = summary[tokenType];
                    const total = bucket.matured + bucket.requestable;
                    return (
                      <div key={tokenType} className="rounded-xl p-3" style={{ backgroundColor: '#1C2128', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between">
                          <p style={labelStyle}>{tokenType}</p>
                          <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#F8FAFC' }}>{formatTokenAmountValue(total, tokenType)}</p>
                        </div>
                        <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '12px', marginTop: '6px' }}>
                          {formatTokenAmountValue(bucket.matured, tokenType)} matured - {formatTokenAmountValue(bucket.requestable, tokenType)} ready
                        </p>
                      </div>
                    );
                  })}

                  <div className="rounded-xl p-3" style={{ backgroundColor: '#1C2128', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={labelStyle}>Latest request</p>
                    <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#F8FAFC', marginTop: '4px' }}>
                      {latestPayout ? `${latestPayout.token_type} · ${latestPayout.status}` : 'No request yet'}
                    </p>
                    <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '12px', marginTop: '6px', lineHeight: 1.5 }}>
                      {latestPayout
                        ? `Cycle: ${latestPayout.payout_cycle_date ?? '—'} · Deadline: ${latestPayout.request_deadline ? new Date(latestPayout.request_deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}`
                        : 'Completed transactions create rewards for one year after referral link. Payouts are requested manually once the $10 threshold is met.'}
                    </p>
                  </div>

                  {referralError && (
                    <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#FCD34D', fontSize: '12px', lineHeight: 1.4 }}>
                      {referralError}
                    </p>
                  )}
                </div>
              )}
            </section>

            <section style={cardStyle} className="p-5">
              <p style={labelStyle}>Profile settings</p>
              <p style={{ ...valueStyle, fontSize: '1.4rem', marginTop: '4px' }}>Edit your personal defaults</p>
              <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '14px', marginTop: '10px', lineHeight: 1.6 }}>
                Keep your display name, notification email, and default token in sync with the invoices you send.
              </p>
              <Link
                to="/settings"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium mt-4"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#F8FAFC', textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}
              >
                Open profile settings
                <ArrowRight className="h-4 w-4" />
              </Link>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AccountPage;
