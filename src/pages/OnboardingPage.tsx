import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useCreateWallet, useImportWallet } from '@privy-io/react-auth/solana';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { ArrowLeft, Check, Loader2, Wallet } from 'lucide-react';
import Header from '@/components/Header';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { useAuthProfile } from '@/contexts/AuthProfileContext';
import { useToast } from '@/hooks/use-toast';

type Step = 'profile' | 'wallet' | 'guide';
type ImportMode = 'privateKey' | 'seedPhrase';

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
  padding: '11px 14px',
  outline: 'none',
  boxSizing: 'border-box',
};

async function registerOnboardingWallet(address: string, getAccessToken: () => Promise<string | null>) {
  const token = await getAccessToken();
  await fetch('/api/register-wallet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ wallet_address: address }),
  });
}

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { profile, refreshProfile } = useAuthProfile();
  const { activeWallet, allWallets } = useActiveWallet();
  const { createWallet } = useCreateWallet();
  const { importWallet } = useImportWallet();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('profile');
  const [displayName, setDisplayName] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>('privateKey');
  const [privateKey, setPrivateKey] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [importError, setImportError] = useState('');

  const truvloWallet = useMemo(() => activeWallet ?? allWallets[0] ?? null, [activeWallet, allWallets]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(current => current || profile.display_name || '');
    setNotificationEmail(current => current || profile.notification_email || '');
  }, [profile]);

  const saveProfile = async (completed = false) => {
    const name = displayName.trim();
    const email = notificationEmail.trim().toLowerCase();
    if (!name) {
      toast({ title: 'Add your name', description: 'Use your name or business name.', variant: 'destructive' });
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: 'Add a valid email', description: 'This is where Truvlo sends invoice updates.', variant: 'destructive' });
      return false;
    }

    setSaving(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          display_name: name,
          default_token: 'USDC',
          notification_email: email,
          onboarding_completed_at: completed ? new Date().toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast({ title: 'Could not save profile', description: body.error || `HTTP ${res.status}`, variant: 'destructive' });
        return false;
      }
      setDisplayName(name);
      setNotificationEmail(email);
      await refreshProfile();
      return true;
    } catch (error) {
      toast({ title: 'Could not save profile', description: error instanceof Error ? error.message : 'Network error', variant: 'destructive' });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const continueWithTruvloWallet = async () => {
    setSaving(true);
    try {
      const wallet = truvloWallet ?? await createWallet();
      if (!wallet?.address) throw new Error('Wallet was not created');
      await registerOnboardingWallet(wallet.address, getAccessToken);
      setStep('guide');
    } catch (error) {
      toast({
        title: 'Wallet setup failed',
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const importOwnWallet = async () => {
    setImportError('');
    setSaving(true);
    try {
      let key = privateKey.trim();
      if (importMode === 'seedPhrase') {
        const words = seedPhrase.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
          setImportError('Enter a valid 12 or 24-word seed phrase.');
          return;
        }
        if (!bip39.validateMnemonic(seedPhrase.trim())) {
          setImportError('Check your seed phrase and try again.');
          return;
        }
        const seed = bip39.mnemonicToSeedSync(seedPhrase.trim());
        const { key: derivedKey } = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
        key = bs58.encode(Keypair.fromSeed(derivedKey).secretKey);
      }
      if (!key) {
        setImportError('Paste your private key first.');
        return;
      }
      const imported = await importWallet({ privateKey: key });
      if (imported?.address) await registerOnboardingWallet(imported.address, getAccessToken);
      setStep('guide');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import failed';
      setImportError(message.includes('already') ? 'That wallet is already linked.' : message);
    } finally {
      setSaving(false);
    }
  };

  const finishOnboarding = async () => {
    if (await saveProfile(true)) navigate('/dashboard', { replace: true });
  };

  if (!ready || !authenticated) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--tl-bg-soft)' }}>
        <Header />
        <main className="max-w-md mx-auto px-6 py-16">
          <button
            type="button"
            onClick={() => login()}
            style={{ width: '100%', backgroundColor: 'var(--tl-brand)', color: 'var(--tl-bg-soft)', border: 'none', borderRadius: '8px', padding: '12px 0', fontFamily: '"DM Sans", sans-serif', fontWeight: 700 }}
          >
            Login to continue
          </button>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--tl-bg-soft)' }}>
      <Header />
      <main className="max-w-xl mx-auto px-5 py-10 sm:py-14">
        <div style={{ marginBottom: '28px' }}>
          <p style={labelStyle}>Welcome to Truvlo</p>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '2rem', fontWeight: 700, color: '#F8FAFC', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Set up your account
          </h1>
        </div>

        <section style={{ backgroundColor: 'var(--tl-surface-2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '24px' }}>
          {step === 'profile' && (
            <div className="space-y-5">
              <div>
                <label htmlFor="displayName" style={labelStyle}>Name or business name</label>
                <input id="displayName" name="displayName" value={displayName} onChange={e => setDisplayName(e.target.value.slice(0, 50))} autoComplete="name" placeholder="Your name or business" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="notificationEmail" style={labelStyle}>Notification email</label>
                <input id="notificationEmail" name="notificationEmail" type="email" value={notificationEmail} onChange={e => setNotificationEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" style={inputStyle} />
                <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#64748B', fontSize: '12px', marginTop: '7px' }}>Used for invoice, withdrawal, and dispute updates.</p>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={async () => { if (await saveProfile(false)) setStep('wallet'); }}
                style={{ width: '100%', backgroundColor: 'var(--tl-brand)', color: 'var(--tl-bg-soft)', border: 'none', borderRadius: '8px', padding: '12px 0', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving...' : 'Continue'}
              </button>
            </div>
          )}

          {step === 'wallet' && (
            <div className="space-y-5">
              <button type="button" onClick={() => setStep('profile')} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0, fontFamily: '"DM Sans", sans-serif' }}>
                <ArrowLeft size={14} /> Back
              </button>
              <div>
                <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.25rem', fontWeight: 700, color: '#F8FAFC' }}>Set up your wallet</h2>
                <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '14px', marginTop: '6px' }}>
                  Use your Truvlo wallet or import an existing wallet. This wallet is linked to invoices, withdrawals, and reputation.
                </p>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={continueWithTruvloWallet}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: 'rgba(var(--tl-brand-rgb), 0.08)', border: '1px solid rgba(var(--tl-brand-rgb), 0.2)', borderRadius: '10px', padding: '16px', color: '#F8FAFC', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1, textAlign: 'left' }}
              >
                <Wallet size={20} style={{ color: 'var(--tl-brand)', flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontWeight: 700 }}>Use your Truvlo wallet</span>
                  <span style={{ display: 'block', fontFamily: '"JetBrains Mono", monospace', color: '#64748B', fontSize: '12px', marginTop: '3px' }}>
                    {truvloWallet ? `${truvloWallet.address.slice(0, 6)}...${truvloWallet.address.slice(-6)}` : 'Create a new embedded Solana wallet'}
                  </span>
                </span>
              </button>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '18px' }}>
                <p style={{ ...labelStyle, marginBottom: '10px' }}>Import an existing wallet</p>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--tl-surface-3)', borderRadius: '8px', padding: '3px', marginBottom: '14px' }}>
                  {(['privateKey', 'seedPhrase'] as const).map(mode => (
                    <button key={mode} type="button" onClick={() => { setImportMode(mode); setImportError(''); }} style={{ flex: 1, border: 'none', borderRadius: '6px', padding: '8px 0', backgroundColor: importMode === mode ? 'var(--tl-surface-2)' : 'transparent', color: importMode === mode ? '#F8FAFC' : '#64748B', fontFamily: '"DM Sans", sans-serif', cursor: 'pointer' }}>
                      {mode === 'privateKey' ? 'Private key' : 'Seed phrase'}
                    </button>
                  ))}
                </div>
                {importMode === 'privateKey' ? (
                  <input type="password" autoComplete="off" value={privateKey} onChange={e => { setPrivateKey(e.target.value); setImportError(''); }} placeholder="Paste your private key" style={{ ...inputStyle, fontFamily: '"JetBrains Mono", monospace' }} />
                ) : (
                  <textarea value={seedPhrase} onChange={e => { setSeedPhrase(e.target.value); setImportError(''); }} placeholder="Enter your 12 or 24-word seed phrase" rows={3} style={{ ...inputStyle, resize: 'none', lineHeight: 1.5, fontFamily: '"JetBrains Mono", monospace' }} />
                )}
                {importError && <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#F87171', fontSize: '13px', marginTop: '10px' }}>{importError}</p>}
                <button type="button" disabled={saving} onClick={importOwnWallet} style={{ width: '100%', marginTop: '12px', backgroundColor: 'transparent', color: '#F8FAFC', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '11px 0', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Working...' : 'Use imported wallet'}
                </button>
              </div>
            </div>
          )}

          {step === 'guide' && (
            <div className="space-y-5">
              <div>
                <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.25rem', fontWeight: 700, color: '#F8FAFC' }}>How Truvlo works</h2>
                <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#94A3B8', fontSize: '14px', marginTop: '6px' }}>A quick guide before you start.</p>
              </div>
              {[
                'Create an invoice and send it to your client.',
                'Your client pays into escrow, so funds stay protected.',
                'After the work is done, the client approves release or raises a dispute.',
              ].map(item => (
                <div key={item} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                  <Check size={18} style={{ color: 'var(--tl-brand)', marginTop: '2px', flexShrink: 0 }} />
                  <p style={{ fontFamily: '"DM Sans", sans-serif', color: '#F8FAFC', fontSize: '14px', lineHeight: 1.6 }}>{item}</p>
                </div>
              ))}
              <button type="button" disabled={saving} onClick={finishOnboarding} style={{ width: '100%', backgroundColor: 'var(--tl-brand)', color: 'var(--tl-bg-soft)', border: 'none', borderRadius: '8px', padding: '12px 0', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? <Loader2 size={16} className="inline animate-spin" /> : 'Open dashboard'}
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default OnboardingPage;
