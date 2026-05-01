import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useImportWallet } from '@privy-io/react-auth/solana';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import {
  PublicKey,
  Transaction,
  SystemProgram, LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress, getAccount, createTransferInstruction,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { Keypair } from '@solana/web3.js';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, RefreshCw, Loader2, Check, Trash2, ExternalLink, AlertTriangle } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useToast } from '@/hooks/use-toast';
import { createPrivySolanaAnchorWallet } from '@/lib/privySolanaAnchorWallet';

// Devnet USDC mint
const USDC_MINT = new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

type TokenType = 'SOL' | 'USDC';
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

const inputBaseStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1C2128',
  borderRadius: '8px',
  color: '#F8FAFC',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '14px',
  padding: '10px 14px',
  height: '44px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
};

const DarkInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        ...inputBaseStyle,
        border: `1px solid ${focused ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: focused ? '0 0 0 3px rgba(45,212,191,0.08)' : 'none',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
};

const sectionCard: React.CSSProperties = {
  backgroundColor: '#161B22',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  padding: '20px 16px',
  marginBottom: '16px',
};

const sectionTitle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600,
  fontSize: '1rem',
  color: '#F8FAFC',
  marginBottom: '16px',
  margin: 0,
};

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unknown error';
}

function sanitizeSendAmountInput(value: string, tokenType: TokenType): string {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '');
  const firstDot = normalized.indexOf('.');
  const withoutExtraDots = firstDot === -1
    ? normalized
    : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, '')}`;
  const [whole, fraction = ''] = withoutExtraDots.split('.');
  const decimals = tokenType === 'USDC' ? 6 : 9;
  const safeWhole = whole.replace(/^0+(?=\d)/, '');
  if (firstDot !== -1) return `${safeWhole || '0'}.${fraction.slice(0, decimals)}`;
  return safeWhole;
}

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

async function unregisterWallet(address: string, getAccessToken: () => Promise<string | null>) {
  try {
    const token = await getAccessToken();
    await fetch('/api/register-wallet', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wallet_address: address }),
    });
  } catch { /* non-blocking */ }
}

const WalletPage: React.FC = () => {
  const { authenticated, ready, getAccessToken, login } = usePrivy();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { activeWallet, allWallets, setActiveWallet } = useActiveWallet();
  const { importWallet } = useImportWallet();
  const { toast } = useToast();

  // ─── all state up-front (hooks must not be after early return) ───────────
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [sendToken, setSendToken] = useState<TokenType>('SOL');
  const [recipient, setRecipient] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sending, setSending] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>('privateKey');
  const [importKey, setImportKey] = useState('');
  const [importSeed, setImportSeed] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [removeModalWallet, setRemoveModalWallet] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [showCombinedWarning, setShowCombinedWarning] = useState(false);

  // FIX: Memoize publicKey so its reference is stable across renders.
  // Without useMemo, `new PublicKey(addr)` creates a new object on every render,
  // causing fetchBalances (which depends on publicKey) to re-fire endlessly:
  // fetch → setBalanceLoading(false) → re-render → new publicKey ref → new fetchBalances → fetch again.
  const walletAddress = activeWallet?.address ?? null;
  const publicKey = useMemo(
    () => walletAddress ? new PublicKey(walletAddress) : null,
    [walletAddress]
  );

  // Auth guard
  useEffect(() => {
    if (ready && !authenticated) navigate('/', { replace: true });
  }, [ready, authenticated, navigate]);

  // Load profile slug — if null, auto-register active wallet to generate one
  useEffect(() => {
    if (!ready || !authenticated || !activeWallet) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (data.profile_slug) {
          setProfileSlug(data.profile_slug);
        } else {
          // No slug yet — register the active wallet to generate one
          const regRes = await fetch('/api/register-wallet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ wallet_address: activeWallet.address }),
          });
          if (regRes.ok) {
            const regData = await regRes.json();
            setProfileSlug(regData.profile_slug ?? null);
          }
        }
      } catch { /* non-blocking */ }
    })();
  }, [ready, authenticated, getAccessToken, activeWallet]);

  // ─── balances ─────────────────────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!publicKey) return;
    setBalanceLoading(true);
    try {
      const sol = await connection.getBalance(publicKey);
      setSolBalance(sol / LAMPORTS_PER_SOL);
    } catch { setSolBalance(null); }
    try {
      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);
      const account = await getAccount(connection, ata);
      setUsdcBalance(Number(account.amount) / 1_000_000);
    } catch { setUsdcBalance(0); }
    setBalanceLoading(false);
  }, [publicKey, connection]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ─── anchor wallet for signing ────────────────────────────────────────────
  const anchorWallet = useMemo(() => {
    if (!publicKey || !activeWallet) return null;
    return createPrivySolanaAnchorWallet(activeWallet, publicKey);
  }, [publicKey, activeWallet]);

  // Early return after all hooks
  if (!ready || !authenticated) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0D1117', display: 'flex', flexDirection: 'column' }}>
        <Header />
        <main style={{ flex: 1, maxWidth: '560px', margin: '0 auto', width: '100%', padding: '48px 16px' }}>
          <div className="rounded-xl p-8 text-center" style={sectionCard}>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#F8FAFC', marginBottom: '8px' }}>
              Connect your account
            </p>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '14px', color: '#94A3B8', marginBottom: '20px' }}>
              Login to manage wallets, receive funds, and send devnet SOL or USDC.
            </p>
            <button
              type="button"
              disabled={!ready}
              onClick={() => login()}
              style={{
                backgroundColor: '#2DD4BF',
                color: '#0D1117',
                border: 'none',
                borderRadius: '8px',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                padding: '10px 22px',
                cursor: ready ? 'pointer' : 'not-allowed',
                opacity: ready ? 1 : 0.6,
              }}
            >
              {ready ? 'Login' : 'Loading...'}
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ─── handlers ─────────────────────────────────────────────────────────────
  const handleCopyAddress = async () => {
    if (!activeWallet?.address) return;
    await navigator.clipboard.writeText(activeWallet.address);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
  };

  const handleRemoveWallet = async () => {
    if (!removeModalWallet) return;
    setRemoving(true);
    await unregisterWallet(removeModalWallet, getAccessToken);
    toast({ title: 'Wallet removed from your account' });
    setRemoveModalWallet(null);
    setRemoving(false);
  };

  const handleCopySingleLink = async () => {
    if (!activeWallet?.address) return;
    await navigator.clipboard.writeText(`${window.location.origin}/profile/${activeWallet.address}`);
    toast({ title: 'Link copied' });
  };

  const handleCopyCombinedLink = async () => {
    if (!profileSlug) return;
    await navigator.clipboard.writeText(`${window.location.origin}/profile/account/${profileSlug}`);
    toast({ title: 'Combined profile link copied' });
    setShowCombinedWarning(false);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !anchorWallet) return;

    let recipientKey: PublicKey;
    try {
      recipientKey = new PublicKey(recipient.trim());
    } catch {
      toast({ title: 'Invalid recipient address', variant: 'destructive' });
      return;
    }

    const amount = Number(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = new Transaction({ blockhash, feePayer: publicKey, lastValidBlockHeight });

      if (sendToken === 'SOL') {
        tx.add(SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: recipientKey,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        }));
      } else {
        const fromAta = await getAssociatedTokenAddress(USDC_MINT, publicKey);
        const toAta = await getAssociatedTokenAddress(USDC_MINT, recipientKey);
        try {
          await getAccount(connection, toAta);
        } catch {
          tx.add(createAssociatedTokenAccountInstruction(
            publicKey, toAta, recipientKey, USDC_MINT,
            TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
          ));
        }
        tx.add(createTransferInstruction(
          fromAta, toAta, publicKey,
          BigInt(Math.floor(amount * 1_000_000)),
        ));
      }

      const signed = await anchorWallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature: sig });

      toast({ title: `${sendToken} sent`, description: `Tx: ${sig.slice(0, 8)}...` });
      setRecipient('');
      setSendAmount('');
      fetchBalances();
    } catch (err) {
      const msg = getErrorMessage(err);
      const display = msg.includes('insufficient') ? `Your active wallet does not have enough ${sendToken} to send this amount. Add funds or reduce the amount.`
        : msg.includes('rejected') ? 'Transaction cancelled.' : msg;
      toast({ title: 'Send failed', description: display, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError('');
    setImporting(true);
    try {
      let key = '';
      if (importTab === 'privateKey') {
        key = importKey.trim();
        if (!key) { setImportError('Enter your private key.'); setImporting(false); return; }
      } else {
        const words = importSeed.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
          setImportError('Enter a valid 12 or 24-word seed phrase.');
          setImporting(false);
          return;
        }
        if (!bip39.validateMnemonic(importSeed.trim())) {
          setImportError('Invalid seed phrase — check your words.');
          setImporting(false);
          return;
        }
        const seed = bip39.mnemonicToSeedSync(importSeed.trim());
        const { key: derivedKey } = derivePath("m/44'/501'/0'/0'", seed.toString('hex'));
        const keypair = Keypair.fromSeed(derivedKey);
        key = bs58.encode(keypair.secretKey);
      }
      const imported = await importWallet({ privateKey: key });
      if (imported?.address) registerWallet(imported.address, getAccessToken);
      toast({ title: 'Wallet imported' });
      setImportKey('');
      setImportSeed('');
      fetchBalances();
    } catch (err) {
      const msg = getErrorMessage(err);
      setImportError(msg.includes('already') ? 'A wallet is already linked to this key.' : msg);
    } finally {
      setImporting(false);
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D1117', display: 'flex', flexDirection: 'column' }}>
      <Header />
      <main style={{ flex: 1, maxWidth: '560px', margin: '0 auto', width: '100%', padding: '32px 16px 80px' }}>

        {/* Page title */}
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '1.625rem',
            color: '#F8FAFC',
            letterSpacing: '-0.02em',
            marginBottom: '4px',
          }}>
            Wallet
          </h1>
          <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '13px' }}>
            {activeWallet?.address
              ? `${activeWallet.address.slice(0, 6)}...${activeWallet.address.slice(-6)}`
              : 'No wallet connected'}
          </p>
        </div>

        {/* ── Your Wallets ──────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={{ ...sectionTitle, marginBottom: '14px' }}>Your Wallets</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {allWallets.length === 0 && (
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B' }}>
                No wallets connected.
              </p>
            )}
            {allWallets.map(w => {
              const isActive = w.address === activeWallet?.address;
              const short = `${w.address.slice(0, 6)}...${w.address.slice(-6)}`;
              return (
                <div
                  key={w.address}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: isActive ? 'rgba(45,212,191,0.05)' : '#1C2128',
                    border: `1px solid ${isActive ? 'rgba(45,212,191,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: '8px',
                    padding: '10px 12px',
                    minWidth: 0,
                  }}
                >
                  {/* Status dot */}
                  <div style={{
                    width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                    backgroundColor: isActive ? '#2DD4BF' : '#334155',
                  }} />

                  {/* Address — truncated, takes remaining space */}
                  <span style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: '12px',
                    color: '#F8FAFC',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {short}
                  </span>

                  {/* Active badge */}
                  {isActive && (
                    <span style={{
                      fontFamily: '"DM Sans", sans-serif', fontSize: '11px', fontWeight: 600,
                      color: '#2DD4BF', backgroundColor: 'rgba(45,212,191,0.1)',
                      border: '1px solid rgba(45,212,191,0.2)', borderRadius: '4px',
                      padding: '2px 7px', flexShrink: 0,
                    }}>
                      Active
                    </span>
                  )}

                  {/* Set as Active button */}
                  {!isActive && (
                    <button
                      onClick={() => {
                        setActiveWallet(w);
                        toast({
                          title: 'Active wallet changed',
                          description: 'New invoices and dashboard actions use this wallet. Existing client approvals still require the wallet that paid.',
                        });
                      }}
                      style={{
                        fontFamily: '"DM Sans", sans-serif', fontSize: '11px', fontWeight: 500,
                        color: '#94A3B8', backgroundColor: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                        padding: '3px 8px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                      }}
                    >
                      Set Active
                    </button>
                  )}

                  {/* View reputation link */}
                  <Link
                    to={`/profile/${w.address}`}
                    style={{ color: '#64748B', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                    title="View on-chain reputation"
                  >
                    <ExternalLink size={13} />
                  </Link>

                  {/* Remove button (non-active only) */}
                  {!isActive && (
                    <button
                      onClick={() => setRemoveModalWallet(w.address)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                      title="Remove wallet"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Balances ─────────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <p style={sectionTitle}>Balances</p>
            <button
              onClick={fetchBalances}
              disabled={balanceLoading}
              style={{ background: 'none', border: 'none', cursor: balanceLoading ? 'not-allowed' : 'pointer', color: '#64748B', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Refresh balances"
            >
              <RefreshCw size={14} style={{ animation: balanceLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {([
              { label: 'SOL', value: solBalance },
              { label: 'USDC', value: usdcBalance },
            ] as const).map(({ label, value }) => (
              <div key={label} style={{
                backgroundColor: '#1C2128',
                borderRadius: '10px',
                padding: '16px 14px',
                minWidth: 0,
              }}>
                <p style={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '11px',
                  color: '#64748B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  marginBottom: '8px',
                }}>
                  {label}
                </p>
                <p style={{
                  fontFamily: '"Space Grotesk", sans-serif',
                  fontWeight: 700,
                  fontSize: '1.4rem',
                  color: '#F8FAFC',
                  letterSpacing: '-0.02em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Receive ──────────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={{ ...sectionTitle, marginBottom: '14px' }}>Receive</p>

          {/* Address row — single line, truncated, never wraps */}
          <div style={{
            backgroundColor: '#1C2128',
            borderRadius: '8px',
            padding: '11px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
            minWidth: 0,
          }}>
            <span style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '12px',
              color: '#94A3B8',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {activeWallet?.address ?? '—'}
            </span>
            <button
              onClick={handleCopyAddress}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: addressCopied ? '#2DD4BF' : '#64748B',
                flexShrink: 0,
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Copy address"
            >
              {addressCopied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>

          {/* QR Code — full card width, properly centered, white background */}
          {publicKey && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '20px',
              backgroundColor: '#ffffff',
              borderRadius: '10px',
            }}>
              <QRCodeSVG value={publicKey.toBase58()} size={180} />
            </div>
          )}
        </div>

        {/* ── Share Reputation ─────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={{ ...sectionTitle, marginBottom: '6px' }}>Share Reputation</p>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B', marginBottom: '14px' }}>
            Send a reputation link to a client so they can verify your track record.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Single wallet option */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              backgroundColor: '#1C2128',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              padding: '12px 14px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '13px', color: '#F8FAFC', marginBottom: '2px' }}>
                  This wallet only
                </p>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#64748B' }}>
                  Reputation for your active wallet.
                </p>
              </div>
              <button
                onClick={handleCopySingleLink}
                disabled={!activeWallet}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontFamily: '"DM Sans", sans-serif', fontSize: '12px', fontWeight: 500,
                  color: '#2DD4BF', backgroundColor: 'rgba(45,212,191,0.08)',
                  border: '1px solid rgba(45,212,191,0.2)', borderRadius: '6px',
                  padding: '6px 12px', cursor: activeWallet ? 'pointer' : 'not-allowed',
                  opacity: activeWallet ? 1 : 0.5, flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <Copy size={12} /> Copy Link
              </button>
            </div>

            {/* Combined option */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              backgroundColor: '#1C2128',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '8px',
              padding: '12px 14px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '13px', color: '#F8FAFC', marginBottom: '2px' }}>
                  All wallets (combined)
                </p>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '12px', color: '#64748B' }}>
                  Full reputation across all linked wallets.
                </p>
              </div>
              <button
                onClick={() => setShowCombinedWarning(true)}
                disabled={!profileSlug}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontFamily: '"DM Sans", sans-serif', fontSize: '12px', fontWeight: 500,
                  color: '#94A3B8', backgroundColor: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                  padding: '6px 12px', cursor: profileSlug ? 'pointer' : 'not-allowed',
                  opacity: profileSlug ? 1 : 0.5, flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                <Copy size={12} /> Copy Link
              </button>
            </div>
          </div>
        </div>

        {/* ── Send ─────────────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={{ ...sectionTitle, marginBottom: '16px' }}>Send</p>
          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <p style={labelStyle}>Token</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {(['SOL', 'USDC'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSendToken(t)}
                    style={{
                      padding: '8px 20px',
                      borderRadius: '8px',
                      border: sendToken === t ? '1px solid rgba(45,212,191,0.3)' : '1px solid rgba(255,255,255,0.08)',
                      backgroundColor: sendToken === t ? 'rgba(45,212,191,0.1)' : '#1C2128',
                      color: sendToken === t ? '#2DD4BF' : '#94A3B8',
                      fontFamily: '"DM Sans", sans-serif',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="recipientAddress" style={labelStyle}>Recipient Address</label>
              <DarkInput
                id="recipientAddress"
                name="recipientAddress"
                type="text"
                autoComplete="off"
                placeholder="Solana wallet address"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="sendAmount" style={labelStyle}>Amount ({sendToken})</label>
              <DarkInput
                id="sendAmount"
                name="sendAmount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={sendAmount}
                onChange={e => setSendAmount(sanitizeSendAmountInput(e.target.value, sendToken))}
              />
            </div>

            <button
              type="submit"
              disabled={sending || !publicKey}
              style={{
                backgroundColor: '#2DD4BF',
                color: '#0D1117',
                border: 'none',
                borderRadius: '8px',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 600,
                fontSize: '14px',
                padding: '11px 0',
                cursor: sending || !publicKey ? 'not-allowed' : 'pointer',
                opacity: sending || !publicKey ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {sending && <Loader2 size={15} className="animate-spin" />}
              {sending ? 'Sending…' : `Send ${sendToken}`}
            </button>
          </form>
        </div>

        {/* ── Import Wallet ─────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={{ ...sectionTitle, marginBottom: '6px' }}>Import Wallet</p>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
            Add an existing wallet to your account by importing it.
          </p>

          <div style={{ display: 'flex', gap: '4px', backgroundColor: '#1C2128', borderRadius: '8px', padding: '3px', marginBottom: '16px' }}>
            {(['privateKey', 'seedPhrase'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setImportTab(t); setImportError(''); }}
                style={{
                  flex: 1,
                  padding: '7px 0',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: importTab === t ? '#161B22' : 'transparent',
                  color: importTab === t ? '#F8FAFC' : '#64748B',
                  transition: 'all 150ms ease',
                }}
              >
                {t === 'privateKey' ? 'Private Key' : 'Seed Phrase'}
              </button>
            ))}
          </div>

          <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {importTab === 'privateKey' ? (
              <div>
                <label htmlFor="walletPrivateKey" style={labelStyle}>Private Key (base58)</label>
                <input
                  id="walletPrivateKey"
                  name="walletPrivateKey"
                  type="password"
                  autoComplete="off"
                  value={importKey}
                  onChange={e => { setImportKey(e.target.value); setImportError(''); }}
                  placeholder="Paste your base58-encoded private key"
                  style={{ ...inputBaseStyle, border: '1px solid rgba(255,255,255,0.08)', fontFamily: '"JetBrains Mono", monospace', fontSize: '13px' }}
                />
              </div>
            ) : (
              <div>
                <label htmlFor="walletSeedPhrase" style={labelStyle}>Seed Phrase</label>
                <textarea
                  id="walletSeedPhrase"
                  name="walletSeedPhrase"
                  autoComplete="off"
                  value={importSeed}
                  onChange={e => { setImportSeed(e.target.value); setImportError(''); }}
                  placeholder="Enter your 12 or 24-word seed phrase..."
                  rows={3}
                  style={{ ...inputBaseStyle, height: 'auto', resize: 'none', border: '1px solid rgba(255,255,255,0.08)', fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', lineHeight: 1.6 }}
                />
              </div>
            )}

            {importError && (
              <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#F87171' }}>
                {importError}
              </p>
            )}

            <button
              type="submit"
              disabled={importing}
              style={{
                backgroundColor: 'transparent',
                color: '#F8FAFC',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 500,
                fontSize: '14px',
                padding: '10px 0',
                cursor: importing ? 'not-allowed' : 'pointer',
                opacity: importing ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {importing && <Loader2 size={15} className="animate-spin" />}
              {importing ? 'Importing…' : 'Import Wallet'}
            </button>
          </form>
        </div>

      </main>
      <Footer />

      {/* ── Remove wallet confirmation modal ──────────────────────────────── */}
      {removeModalWallet && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px',
          }}>
            <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#F8FAFC', marginBottom: '12px' }}>
              Remove wallet?
            </p>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '14px', color: '#94A3B8', marginBottom: '8px' }}>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '13px', color: '#F8FAFC' }}>
                {removeModalWallet.slice(0, 4)}...{removeModalWallet.slice(-4)}
              </span>
            </p>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '14px', color: '#94A3B8', marginBottom: '24px', lineHeight: 1.6 }}>
              This only unlinks the wallet from your Truvlo profile. The wallet and its on-chain history are not affected.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setRemoveModalWallet(null)}
                style={{ flex: 1, padding: '10px 0', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveWallet}
                disabled={removing}
                style={{ flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none', backgroundColor: '#EF4444', color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '14px', cursor: removing ? 'not-allowed' : 'pointer', opacity: removing ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {removing && <Loader2 size={14} className="animate-spin" />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Combined profile privacy warning modal ────────────────────────── */}
      {showCombinedWarning && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
        }}>
          <div style={{
            backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '400px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
              <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1rem', color: '#F8FAFC' }}>
                Heads up
              </p>
            </div>
            <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '14px', color: '#94A3B8', lineHeight: 1.6, marginBottom: '24px' }}>
              Your combined profile lists all {allWallets.length} wallet{allWallets.length !== 1 ? 's' : ''} linked to your account. Anyone with this link will be able to see every wallet address and verify them on Solana. Only share this if you're comfortable disclosing all your wallets.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowCombinedWarning(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'transparent', color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCopyCombinedLink}
                style={{ flex: 1, padding: '10px 0', borderRadius: '8px', border: 'none', backgroundColor: '#2DD4BF', color: '#0D1117', fontFamily: '"DM Sans", sans-serif', fontWeight: 600, fontSize: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Copy size={14} /> Share anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletPage;
