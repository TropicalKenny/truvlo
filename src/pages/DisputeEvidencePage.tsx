import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { PublicKey } from '@solana/web3.js';
import { AlertTriangle, Check, ExternalLink, FileText, Loader2, SendHorizonal } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { useToast } from '@/hooks/use-toast';

type DisputeCase = {
  id: string;
  invoice_id: string;
  creator_wallet: string;
  client_wallet: string | null;
  status: string;
  opened_by_role?: string | null;
  evidence_deadline_at?: string | null;
};

type EvidenceRow = {
  id: string;
  side: string;
  evidence_type: string;
  evidence_url: string | null;
  note: string | null;
  created_at?: string | null;
};

const cardStyle: React.CSSProperties = {
  maxWidth: '640px',
  margin: '0 auto',
  backgroundColor: 'var(--tl-surface)',
  border: '1px solid var(--tl-border)',
  borderRadius: '8px',
  overflow: 'hidden',
};

const shortWallet = (address: string) => `${address.slice(0, 6)}...${address.slice(-6)}`;

const formatEvidenceDeadline = (deadline?: string | null) => {
  if (!deadline) return 'Open';
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return 'Open';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const DisputeEvidencePage: React.FC = () => {
  const { invoiceId, creator } = useParams<{ invoiceId: string; creator: string }>();
  const navigate = useNavigate();
  const { authenticated, login, getAccessToken } = usePrivy();
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [disputeCase, setDisputeCase] = useState<DisputeCase | null>(null);
  const [evidence, setEvidence] = useState<EvidenceRow[]>([]);
  const [evidenceType, setEvidenceType] = useState('deliverable_link');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const walletAddress = activeWallet?.address ?? null;
  const validCreator = useMemo(() => {
    try {
      return creator ? new PublicKey(creator).toBase58() : null;
    } catch {
      return null;
    }
  }, [creator]);

  useEffect(() => {
    const loadDispute = async () => {
      if (!invoiceId || !validCreator) {
        setError('Invalid dispute link.');
        setLoading(false);
        return;
      }
      if (!authenticated) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({ invoiceId, creatorWallet: validCreator });
        const res = await fetch(`/api/disputes?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({})) as {
          error?: string;
          dispute_case?: DisputeCase;
          evidence?: EvidenceRow[];
        };
        if (!res.ok) throw new Error(data.error || 'Could not load dispute.');
        setDisputeCase(data.dispute_case ?? null);
        setEvidence(data.evidence ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load dispute.');
      } finally {
        setLoading(false);
      }
    };

    void loadDispute();
  }, [authenticated, getAccessToken, invoiceId, validCreator]);

  const handleSubmit = async () => {
    if (!disputeCase || !walletAddress) return;
    if (!note.trim() && !evidenceUrl.trim()) {
      toast({
        title: 'Add evidence first',
        description: 'Add a note, a link, or both before submitting.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action: 'evidence',
          caseId: disputeCase.id,
          submittedByWallet: walletAddress,
          evidenceType,
          evidenceUrl: evidenceUrl.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; evidence?: EvidenceRow };
      if (!res.ok) throw new Error(data.error || 'Could not submit evidence.');
      if (data.evidence) setEvidence(prev => [...prev, data.evidence!]);
      setEvidenceUrl('');
      setNote('');
      toast({ title: 'Evidence submitted', description: 'The dispute record was updated for review.' });
    } catch (submitError) {
      toast({
        title: 'Evidence failed',
        description: submitError instanceof Error ? submitError.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="trust-page min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full px-4 sm:px-6 py-12">
        <div style={cardStyle}>
          <div className="p-6 sm:p-7 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="trust-label mb-2">Dispute evidence</p>
                <h1 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: '1.75rem', fontWeight: 700, color: '#F8FAFC', lineHeight: 1.15 }}>
                  Submit proof for review
                </h1>
                <p className="mt-3 text-sm" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.6 }}>
                  Add deliverables, screenshots, transaction notes, or context. Truvlo uses this record to resolve frozen funds.
                </p>
              </div>
              <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: '#FCD34D' }} />
            </div>
          </div>

          <div className="p-6 sm:p-7 space-y-5">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#2DD4BF' }} />
              </div>
            ) : !authenticated ? (
              <div className="space-y-4 text-center">
                <p className="text-sm" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif' }}>
                  Log in with the wallet or account tied to this invoice to submit evidence.
                </p>
                <button onClick={() => login()} className="trust-button-primary px-5 py-3 text-sm">
                  Continue
                </button>
              </div>
            ) : error ? (
              <div className="space-y-4 text-center">
                <p className="text-sm" style={{ color: '#FCA5A5', fontFamily: '"DM Sans", sans-serif' }}>{error}</p>
                <button onClick={() => navigate('/dashboard')} className="trust-button-secondary px-5 py-3 text-sm">
                  Open Dashboard
                </button>
              </div>
            ) : disputeCase ? (
              <>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128' }}>
                    <p className="trust-label mb-1">Invoice</p>
                    <p className="trust-mono text-xs" style={{ color: '#CBD5E1' }}>{disputeCase.invoice_id}</p>
                  </div>
                  <div className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128' }}>
                    <p className="trust-label mb-1">Status</p>
                    <p className="text-sm capitalize" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>{disputeCase.status.replace(/_/g, ' ')}</p>
                  </div>
                  <div className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128' }}>
                    <p className="trust-label mb-1">Evidence due</p>
                    <p className="text-sm" style={{ color: '#FCD34D', fontFamily: '"DM Sans", sans-serif' }}>
                      {formatEvidenceDeadline(disputeCase.evidence_deadline_at)}
                    </p>
                  </div>
                  <div className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128' }}>
                    <p className="trust-label mb-1">Creator</p>
                    <p className="trust-mono text-xs" style={{ color: '#CBD5E1' }}>{shortWallet(disputeCase.creator_wallet)}</p>
                  </div>
                  <div className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128' }}>
                    <p className="trust-label mb-1">Client</p>
                    <p className="trust-mono text-xs" style={{ color: '#CBD5E1' }}>{disputeCase.client_wallet ? shortWallet(disputeCase.client_wallet) : 'Unassigned'}</p>
                  </div>
                </div>

                <div className="rounded-lg p-4 space-y-4" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <label className="block">
                    <span className="trust-label mb-2 block">Evidence type</span>
                    <select className="trust-select w-full rounded-lg px-3 py-2.5 text-sm" value={evidenceType} onChange={event => setEvidenceType(event.target.value)}>
                      <option value="deliverable_link">Deliverable link</option>
                      <option value="screenshot">Screenshot or media</option>
                      <option value="transaction">Transaction proof</option>
                      <option value="conversation">Conversation record</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="trust-label mb-2 block">Evidence link</span>
                    <input
                      className="trust-input w-full rounded-lg px-3 py-2.5 text-sm"
                      value={evidenceUrl}
                      onChange={event => setEvidenceUrl(event.target.value)}
                      placeholder="https://..."
                      maxLength={2048}
                    />
                  </label>
                  <label className="block">
                    <span className="trust-label mb-2 block">Notes</span>
                    <textarea
                      className="trust-textarea w-full rounded-lg px-3 py-2.5 text-sm min-h-28"
                      value={note}
                      onChange={event => setNote(event.target.value)}
                      placeholder="Explain what happened and what this evidence proves."
                      maxLength={4000}
                    />
                  </label>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !walletAddress}
                    className="trust-button-primary w-full flex items-center justify-center gap-2 px-4 py-3 text-sm disabled:opacity-60"
                  >
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</> : <><SendHorizonal className="h-4 w-4" />Submit evidence</>}
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="trust-label">Evidence already submitted</p>
                  {evidence.length === 0 ? (
                    <div className="rounded-lg p-4 text-sm" style={{ color: '#64748B', border: '1px dashed rgba(255,255,255,0.1)', fontFamily: '"DM Sans", sans-serif' }}>
                      No evidence has been submitted yet.
                    </div>
                  ) : (
                    evidence.map(row => (
                      <div key={row.id} className="rounded-lg p-3.5" style={{ backgroundColor: '#1C2128', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm capitalize" style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontWeight: 600 }}>
                            {row.side} - {row.evidence_type.replace(/_/g, ' ')}
                          </p>
                          <Check className="h-4 w-4" style={{ color: '#4ADE80' }} />
                        </div>
                        {row.note && <p className="mt-2 text-sm" style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.5 }}>{row.note}</p>}
                        {row.evidence_url && (
                          <a href={row.evidence_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs" style={{ color: '#5EEAD4', fontFamily: '"DM Sans", sans-serif' }}>
                            Open evidence <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <Link to="/dashboard" className="trust-button-secondary w-full flex items-center justify-center gap-2 px-4 py-3 text-sm" style={{ textDecoration: 'none' }}>
                  <FileText className="h-4 w-4" />Back to dashboard
                </Link>
              </>
            ) : null}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default DisputeEvidencePage;
