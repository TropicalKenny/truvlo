import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useImportWallet } from '@privy-io/react-auth/solana';
import {
  PublicKey, Transaction, VersionedTransaction,
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
import { Copy, RefreshCw, Loader2, Check } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useToast } from '@/hooks/use-toast';

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
  padding: '24px',
  marginBottom: '20px',
};

const sectionTitle: React.CSSProperties = {
  fontFamily: '"Space Grotesk", sans-serif',
  fontWeight: 600,
  fontSize: '1rem',
  color: '#F8FAFC',
  marginBottom: '16px',
};

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unknown error';
}

const WalletPage: React.FC = () => {
  const { authenticated, ready } = usePrivy();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { wallets } = useSolanaWallets();
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

  const privyWallet = wallets[0];
  const publicKey = privyWallet?.address ? new PublicKey(privyWallet.address) : null;

  // Auth guard
  useEffect(() => {
    if (ready && !authenticated) navigate('/', { replace: true });
  }, [ready, authenticated, navigate]);

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
    if (!publicKey || !privyWallet) return null;
    return {
      publicKey,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
        const bytes = tx instanceof VersionedTransaction
          ? tx.serialize()
          : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        const { signedTransaction } = await privyWallet.signTransaction({ transaction: bytes });
        return (tx instanceof VersionedTransaction
          ? VersionedTransaction.deserialize(signedTransaction)
          : Transaction.from(Buffer.from(signedTransaction))) as T;
      },
    };
  }, [publicKey, privyWallet]);

  // Early return after all hooks
  if (!ready || !authenticated) return <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }} />;

  // ─── handlers ─────────────────────────────────────────────────────────────
  const handleCopyAddress = async () => {
    if (!privyWallet?.address) return;
    await navigator.clipboard.writeText(privyWallet.address);
    setAddressCopied(true);
    setTimeout(() => setAddressCopied(false), 2000);
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

    const amount = parseFloat(sendAmount);
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
      const display = msg.includes('insufficient') ? 'Insufficient balance.'
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
      await importWallet({ privateKey: key });
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
      <main style={{ flex: 1, maxWidth: '560px', margin: '0 auto', width: '100%', padding: '40px 16px 80px' }}>

        {/* Page title */}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.75rem', color: '#F8FAFC', letterSpacing: '-0.02em', marginBottom: '6px' }}>
            Wallet
          </h1>
          <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
            {privyWallet?.address
              ? `${privyWallet.address.slice(0, 6)}...${privyWallet.address.slice(-6)}`
              : 'No wallet connected'}
          </p>
        </div>

        {/* ── Balances ─────────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={sectionTitle}>Balances</p>
            <button
              onClick={fetchBalances}
              disabled={balanceLoading}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px', display: 'flex', alignItems: 'center' }}
            >
              <RefreshCw size={14} className={balanceLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {([
              { label: 'SOL', value: solBalance },
              { label: 'USDC', value: usdcBalance },
            ] as const).map(({ label, value }) => (
              <div key={label} style={{ backgroundColor: '#1C2128', borderRadius: '8px', padding: '16px' }}>
                <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '11px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{label}</p>
                <p style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: '1.5rem', color: '#F8FAFC' }}>
                  {value === null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Receive ──────────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={sectionTitle}>Receive</p>
          <div style={{ backgroundColor: '#1C2128', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: '12px', color: '#94A3B8', wordBreak: 'break-all', flex: 1 }}>
              {privyWallet?.address ?? '—'}
            </p>
            <button
              onClick={handleCopyAddress}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: addressCopied ? '#2DD4BF' : '#64748B', flexShrink: 0, padding: '2px' }}
              title="Copy address"
            >
              {addressCopied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
          {publicKey && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px', backgroundColor: '#fff', borderRadius: '8px', width: 'fit-content', margin: '0 auto' }}>
              <QRCodeSVG value={publicKey.toBase58()} size={160} />
            </div>
          )}
        </div>

        {/* ── Send ─────────────────────────────────────────────────────────── */}
        <div style={sectionCard}>
          <p style={sectionTitle}>Send</p>
          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Token</label>
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
              <label style={labelStyle}>Recipient Address</label>
              <DarkInput
                type="text"
                placeholder="Solana wallet address"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
              />
            </div>

            <div>
              <label style={labelStyle}>Amount ({sendToken})</label>
              <DarkInput
                type="number"
                step={sendToken === 'USDC' ? '0.01' : '0.000001'}
                min="0"
                placeholder="0.00"
                value={sendAmount}
                onChange={e => setSendAmount(e.target.value)}
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
          <p style={sectionTitle}>Import Wallet</p>
          <p style={{ fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: '#64748B', marginBottom: '16px' }}>
            Replace your current wallet by importing an existing one.
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
                <label style={labelStyle}>Private Key (base58)</label>
                <input
                  type="password"
                  value={importKey}
                  onChange={e => { setImportKey(e.target.value); setImportError(''); }}
                  placeholder="Paste your base58-encoded private key"
                  style={{ ...inputBaseStyle, border: '1px solid rgba(255,255,255,0.08)', fontFamily: '"JetBrains Mono", monospace', fontSize: '13px' }}
                />
              </div>
            ) : (
              <div>
                <label style={labelStyle}>Seed Phrase</label>
                <textarea
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
    </div>
  );
};

export default WalletPage;
