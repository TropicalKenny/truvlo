import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, LockKeyhole, Play, ShieldCheck } from 'lucide-react';

const lifecycle = [
  { title: 'Created', meta: 'Apr 24, 2026 - invoice shared', status: 'Created', statusClass: 'trust-status-blue' },
  { title: 'Paid into escrow', meta: 'Apr 25, 2026 - client payment confirmed', status: 'In escrow', statusClass: 'trust-status-blue' },
  { title: 'Release requested', meta: 'Apr 28, 2026 - creator requested release', status: 'Requested', statusClass: 'trust-status-amber' },
  { title: 'Approved by client', meta: 'Apr 29, 2026 - client approved release', status: 'Approved', statusClass: 'trust-status-green' },
  { title: 'Withdrawn', meta: 'Apr 29, 2026 - funds sent to wallet', status: 'Withdrawn', statusClass: 'trust-status-green' },
];

const proofPoints = [
  { label: 'USDC & SOL', detail: 'Stable payments', icon: LockKeyhole },
  { label: 'On-chain escrow', detail: 'Transparent state', icon: ShieldCheck },
  { label: 'Client approval', detail: 'Release with confidence', icon: CheckCircle2 },
  { label: 'Managed disputes', detail: 'Clear review process', icon: Clock3 },
];

const Hero: React.FC = () => {
  const { ready, authenticated, login } = usePrivy();
  const navigate = useNavigate();

  const handleCTA = (path: string) => {
    if (!ready) return;
    if (authenticated) navigate(path);
    else login();
  };

  return (
    <section className="trust-section trust-grid-bg min-h-[calc(100vh-4rem)] flex items-center">
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.86fr)_minmax(430px,0.74fr)] gap-10 lg:gap-14 items-center">
          <div className="max-w-2xl">
            <h1
              className="text-[3rem] sm:text-[4rem] lg:text-[5.3rem] leading-[0.96]"
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 800,
                color: 'var(--tl-text)',
                letterSpacing: '-0.035em',
              }}
            >
              Escrow invoices clients can trust
            </h1>
            <p
              className="mt-6 max-w-xl text-base sm:text-lg leading-8"
              style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}
            >
              On-chain escrow for USDC and SOL invoices. Client approval, managed disputes,
              and a clear payment record for global freelancers and teams.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => handleCTA('/create')}
                disabled={!ready}
                className="trust-button-primary inline-flex items-center justify-center gap-2 px-6 py-3 text-sm"
              >
                Create invoice
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleCTA('/dashboard')}
                disabled={!ready}
                className="trust-button-secondary inline-flex items-center justify-center gap-2 px-6 py-3 text-sm"
              >
                View demo
                <Play className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="trust-shell p-4 sm:p-5">
            <div className="flex items-start justify-between gap-5 border-b pb-4" style={{ borderColor: 'var(--tl-border)' }}>
              <div>
                <p className="trust-label">Invoice #INV-4V6DTZ7H</p>
                <p className="mt-2 text-sm" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                  Web design project
                </p>
              </div>
              <div className="text-right">
                <span className="trust-status trust-status-green">Withdrawn</span>
                <p className="mt-3 text-lg font-bold" style={{ fontFamily: '"Space Grotesk", sans-serif' }}>
                  USDC 1,250.00
                </p>
                <p className="text-xs trust-mono" style={{ color: 'var(--tl-dim)' }}>on Solana</p>
              </div>
            </div>

            <div className="mt-5 space-y-0">
              {lifecycle.map((item, index) => (
                <div key={item.title} className="relative grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 pb-5 last:pb-0">
                  {index < lifecycle.length - 1 && (
                    <span
                      className="absolute left-[13px] top-7 bottom-0 w-px"
                      style={{ backgroundColor: 'rgba(20, 200, 186, 0.45)' }}
                    />
                  )}
                  <span
                    className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full"
                    style={{ backgroundColor: 'var(--tl-teal)', color: '#061110' }}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: 'var(--tl-text)', fontFamily: '"DM Sans", sans-serif' }}>
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>
                      {item.meta}
                    </p>
                  </div>
                  <span className={`trust-status ${item.statusClass} self-start`}>{item.status}</span>
                </div>
              ))}
            </div>

            <a
              href="https://explorer.solana.com/?cluster=devnet"
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center gap-1.5 text-xs"
              style={{ color: 'var(--tl-teal)', fontFamily: '"DM Sans", sans-serif' }}
            >
              View on Solana Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {proofPoints.map(({ label, detail, icon: Icon }) => (
            <div key={label} className="trust-panel-subtle px-4 py-4 flex items-center gap-3">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundColor: 'var(--tl-teal-soft)', color: 'var(--tl-teal)' }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ fontFamily: '"DM Sans", sans-serif' }}>{label}</p>
                <p className="text-xs" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>{detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t pt-8" style={{ borderColor: 'rgba(148, 163, 184, 0.1)' }}>
          <p className="text-center text-sm" style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>
            Real invoice states, client approvals, and managed dispute records in one ledger.
          </p>
        </div>
      </div>
    </section>
  );
};

export default Hero;
