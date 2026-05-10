import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useAuthProfile } from '@/contexts/AuthProfileContext';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '12px',
  fontWeight: 500,
  color: '#94A3B8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--tl-surface-3)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#F8FAFC',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '14px',
  padding: '10px 14px',
  height: '44px',
  outline: 'none',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
  boxSizing: 'border-box',
};

const helpStyle: React.CSSProperties = {
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '12px',
  color: '#64748B',
  marginTop: '6px',
};

const DarkInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        ...inputStyle,
        borderColor: focused ? 'rgba(var(--tl-brand-rgb), 0.3)' : 'rgba(255,255,255,0.08)',
        boxShadow: focused ? '0 0 0 3px rgba(var(--tl-brand-rgb), 0.08)' : 'none',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
};

const ProfileSettingsPage: React.FC = () => {
  const { authenticated, ready, getAccessToken } = usePrivy();
  const { profile, profileLoading, profileReady, refreshProfile } = useAuthProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [defaultToken, setDefaultToken] = useState<'USDC' | 'SOL'>('USDC');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [referredByCode, setReferredByCode] = useState('');
  const [savedValues, setSavedValues] = useState({
    displayName: '',
    defaultToken: 'USDC' as 'USDC' | 'SOL',
    notificationEmail: '',
    referredByCode: '',
  });
  const [copiedReferralCode, setCopiedReferralCode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) {
      navigate('/', { replace: true });
    }
  }, [authenticated, navigate, ready]);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (!profileReady && profileLoading) {
      setLoading(true);
      return;
    }
    if (!profile) {
      setLoading(false);
      return;
    }

    const nextDefaultToken = profile.default_token === 'SOL' ? 'SOL' : 'USDC';
    setDisplayName(profile.display_name ?? '');
    setDefaultToken(nextDefaultToken);
    setNotificationEmail(profile.notification_email ?? '');
    setReferralCode(profile.referral_code ?? '');
    setReferredByCode(profile.referred_by_code ?? '');
    setSavedValues({
      displayName: profile.display_name ?? '',
      defaultToken: nextDefaultToken,
      notificationEmail: profile.notification_email ?? '',
      referredByCode: profile.referred_by_code ?? '',
    });
    setLoading(false);
  }, [authenticated, profile, profileLoading, profileReady, ready]);

  const isDirty =
    displayName !== savedValues.displayName ||
    defaultToken !== savedValues.defaultToken ||
    notificationEmail !== savedValues.notificationEmail ||
    referredByCode !== savedValues.referredByCode;

  const resetForm = () => {
    setDisplayName(savedValues.displayName);
    setDefaultToken(savedValues.defaultToken);
    setNotificationEmail(savedValues.notificationEmail);
    setReferredByCode(savedValues.referredByCode);
  };

  const copyReferralCode = async () => {
    if (!referralCode) return;
    try {
      await navigator.clipboard.writeText(referralCode);
      setCopiedReferralCode(true);
      setTimeout(() => setCopiedReferralCode(false), 1800);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!isDirty) return;
    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
          default_token: defaultToken,
          notification_email: notificationEmail.trim(),
          referred_by_code: referredByCode.trim() || null,
        }),
      });
      if (res.ok) {
        setSavedValues({
          displayName: displayName.trim(),
          defaultToken,
          notificationEmail: notificationEmail.trim(),
          referredByCode: referredByCode.trim(),
        });
        setDisplayName(displayName.trim());
        setNotificationEmail(notificationEmail.trim());
        setReferredByCode(referredByCode.trim());
        await refreshProfile();
        toast({ title: 'Profile saved' });
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: 'Failed to save', description: body.error || `HTTP ${res.status}`, variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Failed to save', description: e instanceof Error ? e.message : 'Network error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--tl-bg-soft)' }}>
      <Header />
      <div
        className="max-w-lg mx-auto px-6"
        style={{ paddingTop: '48px', paddingBottom: '80px' }}
      >
        {/* Page heading */}
        <h1
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '1.75rem',
            color: '#F8FAFC',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            marginBottom: '8px',
          }}
        >
          Profile Settings
        </h1>
        <p style={{ ...helpStyle, marginBottom: '32px', fontSize: '14px' }}>
          Your details auto-fill when you create an invoice — you only need to enter the client's email and work description each time.
        </p>

        {/* Card */}
        <div
          style={{
            backgroundColor: 'var(--tl-surface-2)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '24px',
          }}
        >
          {loading ? (
            /* Skeleton */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {[1, 2, 3].map(i => (
                <div key={i}>
                  <div style={{ height: '12px', width: '80px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ height: '44px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px' }} />
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              {/* Display name */}
              <div>
                <label htmlFor="displayName" style={labelStyle}>Display name</label>
                <DarkInput
                  id="displayName"
                  name="displayName"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value.slice(0, 50))}
                  placeholder="Your name or business"
                  maxLength={50}
                />
                <p style={helpStyle}>Shown on invoices and in your dashboard greeting</p>
              </div>

              {/* Default token */}
              <div>
                <p style={labelStyle}>Default token</p>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                  }}
                >
                  {(['USDC', 'SOL'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDefaultToken(t)}
                      style={{
                        flex: 1,
                        padding: '10px 0',
                        borderRadius: '8px',
                        fontFamily: '"DM Sans", sans-serif',
                        fontSize: '13px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 150ms ease',
                        border: defaultToken === t
                          ? '1px solid rgba(var(--tl-brand-rgb), 0.4)'
                          : '1px solid rgba(255,255,255,0.08)',
                        backgroundColor: defaultToken === t
                          ? 'rgba(var(--tl-brand-rgb), 0.1)'
                          : 'var(--tl-surface-3)',
                        color: defaultToken === t ? 'var(--tl-brand)' : '#94A3B8',
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <p style={helpStyle}>Pre-selected when you create a new invoice</p>
              </div>

              {/* Notification email */}
              <div>
                <label htmlFor="notificationEmail" style={labelStyle}>Notification email</label>
                <DarkInput
                  id="notificationEmail"
                  name="notificationEmail"
                  type="email"
                  autoComplete="email"
                  value={notificationEmail}
                  onChange={e => setNotificationEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <p style={helpStyle}>You'll be notified when a client pays, approves a release, or raises a dispute</p>
              </div>

              {/* Referral code */}
              <div>
                <label htmlFor="referralCode" style={labelStyle}>Referral code</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <DarkInput
                    id="referralCode"
                    name="referralCode"
                    type="text"
                    autoComplete="off"
                    value={referralCode}
                    readOnly
                    aria-readonly="true"
                  />
                  <button
                    type="button"
                    disabled={!referralCode}
                    onClick={copyReferralCode}
                    style={{
                      flexShrink: 0,
                      padding: '0 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: copiedReferralCode ? 'rgba(var(--tl-brand-rgb), 0.12)' : 'var(--tl-surface-3)',
                      color: copiedReferralCode ? 'var(--tl-brand)' : '#F8FAFC',
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '13px',
                      cursor: referralCode ? 'pointer' : 'default',
                    }}
                  >
                    {copiedReferralCode ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p style={helpStyle}>Rewards are recorded after completed transactions, paid manually, and valid for one year after a referral is linked.</p>
              </div>

              {/* Referred by */}
              <div>
                <label htmlFor="referredByCode" style={labelStyle}>Referred by code</label>
                <DarkInput
                  id="referredByCode"
                  name="referredByCode"
                  type="text"
                  autoComplete="off"
                  value={referredByCode}
                  onChange={e => setReferredByCode(e.target.value.toUpperCase().slice(0, 32))}
                  placeholder="Enter a referral code"
                />
                <p style={helpStyle}>Optional. Set once to credit the person who brought you here.</p>
              </div>

            </div>
          )}
        </div>

        {/* Actions */}
        {!loading && isDirty && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                backgroundColor: 'var(--tl-brand)',
                color: 'var(--tl-bg-soft)',
                border: 'none',
                borderRadius: '8px',
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '14px',
                fontWeight: 500,
                padding: '10px 24px',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'opacity 150ms ease',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={resetForm}
              disabled={saving}
              style={{
                backgroundColor: 'transparent',
                color: '#64748B',
                border: 'none',
                borderRadius: '8px',
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '14px',
                padding: '10px 16px',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileSettingsPage;
