import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConnection } from '@solana/wallet-adapter-react';
import { usePrivy } from '@privy-io/react-auth';
import { useSignAndSendTransaction } from '@privy-io/react-auth/solana';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { Loader2, Copy, ExternalLink, Check, Bot } from 'lucide-react';
import { EscrowPaySDK, TokenType } from '@/lib/escrowPaySDK';
import { createPrivySolanaAnchorWallet } from '@/lib/privySolanaAnchorWallet';
import { sendSponsoredSolanaTransaction } from '@/lib/privySponsoredSolana';
import { getSolanaExplorerTxUrl } from '@/lib/solanaConfig';
import { formatTokenAmount } from '@/lib/amountFormat';
import { useToast } from '@/hooks/use-toast';

// ── preserved exactly ──────────────────────────────────────────
function getErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || 'An error occurred';
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.msg === 'string') return obj.msg;
    if (typeof obj.error === 'string') return obj.error;
    try {
      const str = JSON.stringify(error);
      if (str && str !== '{}') return str.length > 150 ? str.substring(0, 150) + '...' : str;
    } catch { /* ignore */ }
  }
  return 'An error occurred';
}
// ───────────────────────────────────────────────────────────────

// Shared input style
const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#1C2128',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#F8FAFC',
  fontFamily: '"DM Sans", sans-serif',
  fontSize: '14px',
  padding: '10px 14px',
  height: '44px',
  outline: 'none',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 'auto',
  minHeight: '88px',
  resize: 'none',
};

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

type AgentJobType = 'human_service' | 'research_task' | 'code_task' | 'api_task' | 'file_delivery';
type VerificationMode = 'manual' | 'agent_assisted' | 'deterministic';

const agentJobOptions: Array<{ value: AgentJobType; label: string }> = [
  { value: 'human_service', label: 'Human service' },
  { value: 'research_task', label: 'Research task' },
  { value: 'code_task', label: 'Code task' },
  { value: 'api_task', label: 'API task' },
  { value: 'file_delivery', label: 'File delivery' },
];

const verificationModeOptions: Array<{ value: VerificationMode; label: string }> = [
  { value: 'manual', label: 'Manual' },
  { value: 'agent_assisted', label: 'Agent-assisted' },
  { value: 'deterministic', label: 'Deterministic' },
];

const DarkInput = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        ...inputStyle,
        borderColor: focused ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.08)',
        boxShadow: focused ? '0 0 0 3px rgba(45,212,191,0.08)' : 'none',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
};

const DarkTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      style={{
        ...textareaStyle,
        borderColor: focused ? 'rgba(45,212,191,0.3)' : 'rgba(255,255,255,0.08)',
        boxShadow: focused ? '0 0 0 3px rgba(45,212,191,0.08)' : 'none',
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
};

const CreateInvoiceForm: React.FC = () => {
  const { connection } = useConnection();
  const { authenticated, getAccessToken } = usePrivy();
  const { activeWallet: privyWallet } = useActiveWallet();
  const publicKey = useMemo(
    () => (privyWallet?.address ? new PublicKey(privyWallet.address) : null),
    [privyWallet?.address],
  );
  const connected = authenticated && !!publicKey;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { signAndSendTransaction } = useSignAndSendTransaction();

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [tokenType, setTokenType] = useState<TokenType>(TokenType.USDC);
  const [agentMode, setAgentMode] = useState(false);
  const [jobType, setJobType] = useState<AgentJobType>('human_service');
  const [verificationMode, setVerificationMode] = useState<VerificationMode>('manual');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [proofText, setProofText] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [createdInvoice, setCreatedInvoice] = useState<{
    invoiceId: string;
    signature: string;
  } | null>(null);

  // ── profile auto-fill ──────────────────────────────────────────
  useEffect(() => {
    if (!authenticated) return;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json() as { display_name: string | null; default_token: string };
          if (data.display_name) setSenderName(data.display_name);
          if (data.default_token === 'SOL') setTokenType(TokenType.SOL);
        }
      } catch { /* non-blocking */ }
    })();
  }, [authenticated, getAccessToken]);

  // ── SDK init — preserved exactly ───────────────────────────────
  const sdk = useMemo(() => {
    if (!publicKey || !privyWallet) return null;
    const anchorWallet = createPrivySolanaAnchorWallet(privyWallet, publicKey);
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
    const sponsorFn = async (tx: Uint8Array): Promise<string> => {
      return sendSponsoredSolanaTransaction(signAndSendTransaction, privyWallet, tx);
    };
    const instance = new EscrowPaySDK(provider, false, sponsorFn);
    if (!instance.isInitialized()) {
      console.error('SDK failed to initialize:', instance.getInitError());
    }
    return instance;
  }, [connection, publicKey, privyWallet, signAndSendTransaction]);

  // ── submit — preserved exactly ──────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!sdk || !connected || !publicKey) {
      toast({ title: 'Wallet not connected', variant: 'destructive' });
      return;
    }
    if (!sdk.isInitialized()) {
      toast({ title: 'SDK not initialized', description: sdk.getInitError() || 'Please try again', variant: 'destructive' });
      return;
    }

    const amountText = amount.trim();
    if (!/^\d+(\.\d+)?$/.test(amountText)) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    const amountNum = Number(amountText);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: 'Enter a valid amount', variant: 'destructive' });
      return;
    }
    if (!description.trim()) {
      toast({ title: 'Description required', variant: 'destructive' });
      return;
    }
    if (!clientEmail.trim() || !clientEmail.includes('@')) {
      toast({ title: 'Valid email required', variant: 'destructive' });
      return;
    }
    if (agentMode && !successCriteria.trim()) {
      toast({ title: 'Success criteria required', description: 'Add a short checklist for agent-assisted review.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);

    try {
      const invoiceId = sdk.generateInvoiceId();

      const result = await sdk.createInvoice({
        invoiceId,
        amount: amountNum,
        tokenType,
      });

      if (result.success && result.data) {
        const invoiceUrl = `${window.location.origin}/invoice/${result.data.invoiceId}/${publicKey?.toBase58()}`;

        setCreatedInvoice({
          invoiceId: result.data.invoiceId,
          signature: result.data.signature,
        });
        toast({ title: 'Invoice created' });

        try {
          const token = await getAccessToken();
          const metaRes = await fetch('/api/create-invoice-meta', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              invoiceId: result.data.invoiceId,
              creatorWallet: publicKey?.toBase58(),
              clientEmail: clientEmail.trim(),
              senderName: senderName.trim(),
              description: description.trim(),
              tokenType: tokenType === TokenType.USDC ? 'USDC' : 'SOL',
              amount: amountNum,
              invoiceUrl,
              jobType: agentMode ? jobType : 'human_service',
              verificationMode: agentMode ? verificationMode : 'manual',
              successCriteria: agentMode ? successCriteria.trim() : null,
              deliverableUrl: agentMode ? deliverableUrl.trim() : null,
              proofText: agentMode ? proofText.trim() : null,
            }),
          });

          if (!metaRes.ok) {
            toast({ title: 'Invoice created, but email failed', description: 'Copy the link below to share with your client.', variant: 'destructive' });
            return;
          }

          const meta = await metaRes.json() as {
            email_status?: 'email_sent' | 'email_skipped' | 'email_error';
            email_error?: string | null;
          };

          if (meta.email_status === 'email_sent') {
            toast({ title: 'Invoice email sent', description: `${formatTokenAmount(amountNum, tokenType)} sent to ${clientEmail.trim()}` });
          } else if (meta.email_status === 'email_error') {
            toast({
              title: 'Invoice created',
              description: meta.email_error || 'Email was not delivered automatically. Copy the secure invoice link below and send it to your client.',
              variant: 'destructive',
            });
          } else {
            toast({ title: 'Invoice created', description: 'Copy the link below to share with your client.' });
          }
        } catch {
          toast({ title: 'Invoice created, but email failed', description: 'Copy the link below to share with your client.', variant: 'destructive' });
        }
      } else {
        const errorMsg = getErrorMessage(result.error);
        console.log('Create invoice failed:', errorMsg);
        toast({ title: 'Failed', description: errorMsg, variant: 'destructive' });
      }
    } catch (error: unknown) {
      console.error('Create invoice exception:', error);
      const errorMsg = getErrorMessage(error);
      let displayMsg = errorMsg;
      if (errorMsg.includes('User rejected') || errorMsg.includes('rejected the request')) {
        displayMsg = 'Transaction cancelled.';
      } else if (errorMsg.toLowerCase().includes('insufficient')) {
        displayMsg = 'Your active wallet needs more SOL for the network fee. Add devnet SOL, then try again.';
      }
      toast({ title: 'Something went wrong — try again', description: displayMsg, variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const invoiceUrl = createdInvoice
    ? `${window.location.origin}/invoice/${createdInvoice.invoiceId}/${publicKey?.toBase58()}`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  // ── not connected ───────────────────────────────────────────────
  if (!connected) {
    return (
      <div
        className="w-full rounded-xl p-12 text-center"
        style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>
          Connect to continue — then create your first escrow invoice.
        </p>
      </div>
    );
  }

  // ── success state ───────────────────────────────────────────────
  if (createdInvoice) {
    return (
      <div
        className="w-full rounded-xl p-8"
        style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="text-center mb-7">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'rgba(45,212,191,0.1)' }}
          >
            <Check className="h-7 w-7" style={{ color: '#2DD4BF' }} />
          </div>
          <h3
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              fontSize: '1.375rem',
              color: '#F8FAFC',
              letterSpacing: '-0.01em',
              marginBottom: '6px',
            }}
          >
            Invoice ready to send
          </h3>
          <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
            Share this link with your client to lock funds in escrow.
          </p>
        </div>

        <div className="space-y-4">
          {/* Invoice ID */}
          <div className="rounded-lg p-4" style={{ backgroundColor: '#1C2128' }}>
            <p style={labelStyle}>Invoice ID</p>
            <p
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '13px',
                color: '#F8FAFC',
                letterSpacing: '0.02em',
              }}
            >
              {createdInvoice.invoiceId}
            </p>
          </div>

          {/* Payment link */}
          <div className="rounded-lg p-4" style={{ backgroundColor: '#1C2128' }}>
            <p style={labelStyle}>Payment Link</p>
            <p
              className="break-all mb-3"
              style={{
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: '11px',
                color: '#94A3B8',
                lineHeight: 1.6,
              }}
            >
              {invoiceUrl}
            </p>
            <button
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-opacity duration-150 hover:opacity-90"
              style={{
                backgroundColor: '#2DD4BF',
                color: '#0D1117',
                fontFamily: '"DM Sans", sans-serif',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>

          {/* Explorer link */}
          <a
            href={getSolanaExplorerTxUrl(createdInvoice.signature)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-xs transition-opacity duration-150 hover:opacity-70"
            style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
          >
            View on Solana Explorer
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex gap-3 mt-7">
          <button
            onClick={() => {
              setCreatedInvoice(null);
              setAmount('');
              setDescription('');
              setClientEmail('');
              setSenderName('');
              setAgentMode(false);
              setJobType('human_service');
              setVerificationMode('manual');
              setSuccessCriteria('');
              setDeliverableUrl('');
              setProofText('');
            }}
            className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-opacity duration-150 hover:opacity-80"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#F8FAFC',
              fontFamily: '"DM Sans", sans-serif',
              cursor: 'pointer',
            }}
          >
            Create Another
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex-1 rounded-lg py-2.5 text-sm font-medium transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: '#2DD4BF',
              color: '#0D1117',
              fontFamily: '"DM Sans", sans-serif',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Open Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── form ────────────────────────────────────────────────────────
  return (
    <div
      className="w-full rounded-xl p-8"
      style={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      {/* Header */}
      <div className="mb-7">
        <h2
          style={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '1.5rem',
            color: '#F8FAFC',
            letterSpacing: '-0.02em',
            marginBottom: '6px',
          }}
        >
          New Invoice
        </h2>
        <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '14px' }}>
          Funds lock on-chain when your client pays.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Token selector */}
        <div>
          <p style={labelStyle}>Token</p>
          <div className="flex gap-2">
            {([TokenType.USDC, TokenType.SOL] as const).map((t) => {
              const active = tokenType === t;
              const label = t === TokenType.USDC ? 'USDC' : 'SOL';
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTokenType(t)}
                  className="px-5 py-2 rounded-lg text-sm font-medium transition-all duration-150"
                  style={{
                    backgroundColor: active ? 'rgba(45,212,191,0.1)' : '#1C2128',
                    border: active ? '1px solid rgba(45,212,191,0.3)' : '1px solid rgba(255,255,255,0.08)',
                    color: active ? '#2DD4BF' : '#94A3B8',
                    fontFamily: '"DM Sans", sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label htmlFor="invoiceAmount" style={labelStyle}>
            Amount ({tokenType === TokenType.USDC ? 'USDC' : 'SOL'})
          </label>
          <DarkInput
            id="invoiceAmount"
            name="invoiceAmount"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            pattern="\d+(\.\d+)?"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        {/* Sender name */}
        <div>
          <label htmlFor="senderName" style={labelStyle}>Your name or company</label>
          <DarkInput
            id="senderName"
            name="senderName"
            type="text"
            autoComplete="name"
            placeholder="e.g. Kenny Fafimiye or Truvlo Studio"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
          />
          <p
            className="mt-1.5"
            style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '12px' }}
          >
            Shown to the client so they know who sent the invoice
          </p>
        </div>

        {/* Client email */}
        <div>
          <label htmlFor="email" style={labelStyle}>Client Email</label>
          <DarkInput
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="client@company.com"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" style={labelStyle}>Description</label>
          <DarkTextarea
            id="description"
            name="description"
            autoComplete="off"
            placeholder="Describe the work or services..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {/* Agent-assisted escrow */}
        <div
          className="rounded-lg p-4"
          style={{
            backgroundColor: '#1C2128',
            border: agentMode ? '1px solid rgba(45,212,191,0.28)' : '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Bot className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: agentMode ? '#2DD4BF' : '#64748B' }} />
              <div>
                <p style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontSize: '14px', fontWeight: 600 }}>
                  Agent-assisted escrow
                </p>
                <p className="mt-1" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.5 }}>
                  Add criteria and proof so Truvlo can show a recommendation. Clients still approve or dispute manually.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !agentMode;
                setAgentMode(next);
                if (!next) {
                  setJobType('human_service');
                  setVerificationMode('manual');
                } else {
                  setJobType('research_task');
                  setVerificationMode('agent_assisted');
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity duration-150 hover:opacity-90"
              style={{
                backgroundColor: agentMode ? '#2DD4BF' : 'transparent',
                border: agentMode ? '1px solid #2DD4BF' : '1px solid rgba(255,255,255,0.12)',
                color: agentMode ? '#0D1117' : '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
              }}
            >
              {agentMode ? 'On' : 'Off'}
            </button>
          </div>

          {agentMode && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="jobType" style={labelStyle}>Job type</label>
                  <select
                    id="jobType"
                    name="jobType"
                    value={jobType}
                    onChange={(e) => setJobType(e.target.value as AgentJobType)}
                    style={inputStyle}
                  >
                    {agentJobOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="verificationMode" style={labelStyle}>Verification mode</label>
                  <select
                    id="verificationMode"
                    name="verificationMode"
                    value={verificationMode}
                    onChange={(e) => setVerificationMode(e.target.value as VerificationMode)}
                    style={inputStyle}
                  >
                    {verificationModeOptions.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="successCriteria" style={labelStyle}>Success criteria</label>
                <DarkTextarea
                  id="successCriteria"
                  name="successCriteria"
                  autoComplete="off"
                  placeholder="Checklist the client should use to judge completion..."
                  value={successCriteria}
                  onChange={(e) => setSuccessCriteria(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="deliverableUrl" style={labelStyle}>Deliverable URL</label>
                <DarkInput
                  id="deliverableUrl"
                  name="deliverableUrl"
                  type="url"
                  autoComplete="url"
                  placeholder="https://..."
                  value={deliverableUrl}
                  onChange={(e) => setDeliverableUrl(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="proofText" style={labelStyle}>Proof text</label>
                <DarkTextarea
                  id="proofText"
                  name="proofText"
                  autoComplete="off"
                  placeholder="Optional proof, notes, test results, or delivery summary..."
                  value={proofText}
                  onChange={(e) => setProofText(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Fee info */}
        <div
          className="rounded-lg p-3.5"
          style={{ backgroundColor: '#1C2128' }}
        >
          <p style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', fontSize: '12px', lineHeight: 1.5 }}>
            You receive 100% of the invoice amount. Your client pays a 1% platform fee (flat $2 below $200).
          </p>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isCreating}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
          style={{
            backgroundColor: '#2DD4BF',
            color: '#0D1117',
            fontFamily: '"DM Sans", sans-serif',
            border: 'none',
            cursor: isCreating ? 'default' : 'pointer',
          }}
        >
          {isCreating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Invoice'
          )}
        </button>
      </form>
    </div>
  );
};

export default CreateInvoiceForm;
