import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { Lock, ArrowRight } from 'lucide-react';

const CYCLING_WORDS = ['actually', 'always', 'finally', 'really'];

const Hero: React.FC = () => {
  const { authenticated, login } = usePrivy();
  const navigate = useNavigate();
  const [wordIndex, setWordIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  const handleCTA = (path: string) => {
    if (authenticated) navigate(path);
    else login();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setWordIndex((i) => (i + 1) % CYCLING_WORDS.length);
        setVisible(true);
      }, 200);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section
      className="relative overflow-hidden min-h-screen flex items-center"
      style={{ backgroundColor: '#0D1117' }}
    >
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 w-full">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 items-center">

          {/* Left — text (7/12) */}
          <div className="md:col-span-7 flex flex-col gap-7">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 w-fit">
              <span
                className="text-xs font-medium uppercase tracking-widest"
                style={{
                  color: '#2DD4BF',
                  fontFamily: '"DM Sans", sans-serif',
                  letterSpacing: '0.1em',
                }}
              >
                Built on Solana
              </span>
              <div
                className="h-px w-8"
                style={{ backgroundColor: 'rgba(45,212,191,0.4)' }}
              />
            </div>

            {/* Headline — cycling italic word */}
            <h1
              className="text-5xl md:text-6xl lg:text-[4.5rem] leading-[1.05] tracking-tight"
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 700,
                color: '#F8FAFC',
                letterSpacing: '-0.025em',
              }}
            >
              Invoices your clients{' '}
              <em
                style={{
                  fontStyle: 'italic',
                  color: '#F8FAFC',
                  display: 'inline-block',
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(4px)',
                  transition: 'opacity 200ms ease, transform 200ms ease',
                }}
              >
                {CYCLING_WORDS[wordIndex]}
              </em>{' '}
              pay.
            </h1>

            {/* Sub-headline */}
            <p
              className="text-lg leading-relaxed max-w-xl"
              style={{
                color: '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 400,
              }}
            >
              Escrow-protected invoicing on Solana. Lock funds on-chain when your
              client pays. Release to your wallet when the work is done.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                onClick={() => handleCTA('/create')}
                className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 hover:opacity-90"
                style={{
                  backgroundColor: '#2DD4BF',
                  color: '#0D1117',
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 500,
                  fontSize: '15px',
                  padding: '13px 28px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Create Invoice
                <ArrowRight size={16} />
              </button>
              <button
                onClick={() => handleCTA('/dashboard')}
                className="inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 hover:opacity-80"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#F8FAFC',
                  fontFamily: '"DM Sans", sans-serif',
                  fontWeight: 500,
                  fontSize: '15px',
                  padding: '13px 28px',
                  cursor: 'pointer',
                }}
              >
                Open Dashboard
              </button>
            </div>

            {/* Trust signals */}
            <div className="flex items-center gap-6 pt-2">
              {[
                { label: 'On-chain escrow', icon: '🔒' },
                { label: 'USDC + SOL', icon: '⚡' },
                { label: 'Dual approval', icon: '✓' },
              ].map(({ label, icon }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="text-xs">{icon}</span>
                  <span
                    className="text-xs"
                    style={{
                      color: '#64748B',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — invoice card mockup (5/12) */}
          <div className="md:col-span-5 flex items-center justify-center md:justify-end">
            <div
              className="relative w-full max-w-sm rounded-xl p-7"
              style={{
                backgroundColor: '#161B22',
                border: '1px solid rgba(255,255,255,0.08)',
                marginTop: '-24px',
              }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p
                    className="text-xs uppercase tracking-widest mb-1"
                    style={{
                      color: '#64748B',
                      fontFamily: '"DM Sans", sans-serif',
                      letterSpacing: '0.08em',
                    }}
                  >
                    Invoice Amount
                  </p>
                  <p
                    style={{
                      fontFamily: '"Space Grotesk", sans-serif',
                      fontWeight: 700,
                      fontSize: '3.5rem',
                      color: '#F8FAFC',
                      letterSpacing: '-0.02em',
                      lineHeight: 1,
                    }}
                  >
                    $2,847
                    <span style={{ fontSize: '2rem', color: '#94A3B8' }}>
                      .50
                    </span>
                  </p>
                </div>
                <div
                  className="w-11 h-11 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(45,212,191,0.1)' }}
                >
                  <Lock size={20} style={{ color: '#2DD4BF' }} />
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center justify-between mb-5">
                <span
                  className="text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{
                    backgroundColor: 'rgba(59,130,246,0.12)',
                    color: '#93C5FD',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  In Escrow
                </span>
              </div>

              {/* Divider */}
              <div
                className="mb-5"
                style={{
                  height: '1px',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              />

              {/* Invoice details */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{
                      color: '#64748B',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    From
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{
                      color: '#F8FAFC',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    Sarah K.
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{
                      color: '#64748B',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    Client
                  </span>
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: '13px',
                      color: '#94A3B8',
                    }}
                  >
                    7iLf...vx1p
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs uppercase tracking-wider"
                    style={{
                      color: '#64748B',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    Description
                  </span>
                  <span
                    className="text-sm"
                    style={{
                      color: '#94A3B8',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    Brand identity + web
                  </span>
                </div>
              </div>

              {/* Release bar */}
              <div
                className="mt-6 rounded-lg p-3 flex items-center justify-between"
                style={{ backgroundColor: '#1C2128' }}
              >
                <span
                  className="text-xs"
                  style={{
                    color: '#94A3B8',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  Awaiting client approval
                </span>
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ backgroundColor: '#38BDF8' }}
                />
              </div>

              {/* Teal top accent line */}
              <div
                className="absolute top-0 left-6 right-6 h-[2px] rounded-b"
                style={{ backgroundColor: '#2DD4BF', opacity: 0.6 }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
