import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useCreateWallet, useImportWallet } from '@privy-io/react-auth/solana';

async function registerWallet(address: string, getAccessToken: () => Promise<string | null>) {
  try {
    const token = await getAccessToken();
    await fetch('/api/register-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wallet_address: address }),
    });
  } catch { /* non-blocking */ }
}
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { Loader2, Wallet, Download, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type Step = 'choice' | 'import';
type ImportTab = 'privateKey' | 'seedPhrase';

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
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: '13px',
  padding: '10px 14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const WalletOnboarding: React.FC = () => {
  const { toast } = useToast();
  const { getAccessToken } = usePrivy();
  const { createWallet } = useCreateWallet();
  const { importWallet } = useImportWallet();

  const [step, setStep] = useState<Step>('choice');
  const [tab, setTab] = useState<ImportTab>('privateKey');
  const [privateKey, setPrivateKey] = useState('');
  const [seedPhrase, setSeedPhrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const newWallet = await createWallet();
      if (newWallet?.address) registerWallet(newWallet.address, getAccessToken);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to create wallet';
      toast({ title: 'Failed to create wallet', description: msg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setError('');
    setLoading(true);
    try {
      let key = '';
      if (tab === 'privateKey') {
        key = privateKey.trim();
        if (!key) { setError('Enter your private key.'); setLoading(false); return; }
      } else {
        const words = seedPhrase.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
          setError('Enter a valid 12 or 24-word seed phrase.');
          setLoading(false);
          return;
        }
        if (!bip39.validateMnemonic(seedPhrase.trim())) {
          setError('Invalid seed phrase — check your words.');
          setLoading(false);
          return;
        }
        const seed = bip39.mnemonicToSeedSync(seedPhrase.trim());
        const { key: derivedKey } = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
        const keypair = Keypair.fromSeed(derivedKey);
        key = bs58.encode(keypair.secretKey);
      }
      const imported = await importWallet({ privateKey: key });
      if (imported?.address) registerWallet(imported.address, getAccessToken);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setError(msg.includes('already') ? 'A wallet is already linked to this key.' : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--tl-surface-2)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '420px',
        }}
      >
        {step === 'choice' ? (
          <>
            <h2
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                fontSize: '1.375rem',
                color: '#F8FAFC',
                letterSpacing: '-0.01em',
                marginBottom: '8px',
              }}
            >
              Set up your wallet
            </h2>
            <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', marginBottom: '24px' }}>
              How would you like to get started?
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  backgroundColor: 'rgba(var(--tl-brand-rgb), 0.06)',
                  border: '1px solid rgba(var(--tl-brand-rgb), 0.2)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: loading ? 0.6 : 1,
                  transition: 'border-color 150ms ease',
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(var(--tl-brand-rgb), 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {loading ? <Loader2 size={18} style={{ color: 'var(--tl-brand)', animation: 'spin 1s linear infinite' }} /> : <Wallet size={18} style={{ color: 'var(--tl-brand)' }} />}
                </div>
                <div>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '14px', color: '#F8FAFC', marginBottom: '4px' }}>
                    Create secure Truvlo wallet
                  </p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B' }}>
                    No private key entry required. Linked to invoices, withdrawals, and reputation.
                  </p>
                </div>
              </button>

              <button
                onClick={() => setStep('import')}
                disabled={loading}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '14px',
                  backgroundColor: 'var(--tl-surface-3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Download size={18} style={{ color: '#94A3B8' }} />
                </div>
                <div>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '14px', color: '#F8FAFC', marginBottom: '4px' }}>
                    Advanced import
                  </p>
                  <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B' }}>
                    Only use this if you already control a wallet and understand the key handling risk.
                  </p>
                </div>
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              onClick={() => { setStep('choice'); setError(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', padding: '0', marginBottom: '20px' }}
            >
              <ArrowLeft size={14} /> Back
            </button>

            <h2 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#F8FAFC', letterSpacing: '-0.01em', marginBottom: '20px' }}>
              Advanced import
            </h2>

            <div style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.22)', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.5, color: '#FCD34D' }}>
                Private keys and seed phrases control the wallet. Truvlo does not need them for normal payments; create a secure Truvlo wallet unless you are intentionally importing an existing wallet.
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--tl-surface-3)', borderRadius: '8px', padding: '3px', marginBottom: '20px' }}>
              {(['privateKey', 'seedPhrase'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTab(t); setError(''); }}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: '13px',
                    fontWeight: 500,
                    backgroundColor: tab === t ? 'var(--tl-surface-2)' : 'transparent',
                    color: tab === t ? '#F8FAFC' : '#64748B',
                    transition: 'all 150ms ease',
                  }}
                >
                  {t === 'privateKey' ? 'Private Key' : 'Seed Phrase'}
                </button>
              ))}
            </div>

            {tab === 'privateKey' ? (
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="onboardingPrivateKey" style={labelStyle}>Private Key (base58)</label>
                <input
                  id="onboardingPrivateKey"
                  name="onboardingPrivateKey"
                  type="password"
                  autoComplete="off"
                  value={privateKey}
                  onChange={e => { setPrivateKey(e.target.value); setError(''); }}
                  placeholder="Paste your base58-encoded private key"
                  style={inputStyle}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="onboardingSeedPhrase" style={labelStyle}>Seed Phrase</label>
                <textarea
                  id="onboardingSeedPhrase"
                  name="onboardingSeedPhrase"
                  autoComplete="off"
                  value={seedPhrase}
                  onChange={e => { setSeedPhrase(e.target.value); setError(''); }}
                  placeholder="Enter your 12 or 24-word seed phrase..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'none', height: 'auto', lineHeight: 1.6 }}
                />
              </div>
            )}

            {error && (
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#F87171', marginBottom: '14px' }}>
                {error}
              </p>
            )}

            <button
              onClick={handleImport}
              disabled={loading}
              style={{
                width: '100%',
                backgroundColor: 'var(--tl-brand)',
                color: 'var(--tl-bg-soft)',
                border: 'none',
                borderRadius: '8px',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                padding: '11px 0',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Importing...' : 'Import existing wallet'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default WalletOnboarding;
