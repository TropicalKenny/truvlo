import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { AlertTriangle, ArrowRight, Coins, FileCheck2, Shield, Timer, Users } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Escrow protection',
    body: "Funds are held by the smart contract after payment, not by Truvlo's bank account.",
    tone: 'teal',
  },
  {
    icon: Users,
    title: 'Client approval',
    body: 'Creators request withdrawal. Clients approve, dispute, or the release window runs its course.',
    tone: 'blue',
  },
  {
    icon: Coins,
    title: 'USDC and SOL',
    body: 'Create invoices in the tokens your client can actually pay with on Solana devnet.',
    tone: 'green',
  },
  {
    icon: AlertTriangle,
    title: 'Managed disputes',
    body: 'If a client disputes, funds freeze while the platform reviews evidence and applies the final split on-chain.',
    tone: 'amber',
  },
  {
    icon: Timer,
    title: 'Release window',
    body: 'A 7-day approval window protects creators when a client stops responding after work is delivered.',
    tone: 'blue',
  },
  {
    icon: FileCheck2,
    title: 'Account record',
    body: 'Completed invoices build a readable account history across the wallets linked to one profile.',
    tone: 'teal',
  },
];

const toneColor: Record<string, string> = {
  teal: 'var(--tl-teal)',
  blue: '#93c5fd',
  green: '#4ade80',
  amber: '#fcd34d',
};

const toneBg: Record<string, string> = {
  teal: 'var(--tl-teal-soft)',
  blue: 'rgba(59, 130, 246, 0.14)',
  green: 'rgba(34, 197, 94, 0.12)',
  amber: 'rgba(245, 158, 11, 0.14)',
};

const Features: React.FC = () => {
  const { ready, authenticated, login } = usePrivy();
  const navigate = useNavigate();

  return (
    <section className="trust-section py-20" style={{ backgroundColor: 'var(--tl-bg)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-10">
          <div>
            <h2
              className="text-3xl md:text-4xl"
              style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 800, color: 'var(--tl-text)', letterSpacing: '-0.03em' }}
            >
              Built around payment confidence
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
              The product should read like an operating ledger: what was created, what was paid,
              what needs approval, and what is ready to withdraw.
            </p>
          </div>
          <button
            onClick={() => {
              if (!ready) return;
              authenticated ? navigate('/create') : login();
            }}
            disabled={!ready}
            className="trust-button-primary inline-flex items-center justify-center gap-2 px-5 py-3 text-sm w-full sm:w-fit"
          >
            Create invoice
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px overflow-hidden trust-panel">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="p-6" style={{ backgroundColor: 'rgba(17, 24, 32, 0.72)' }}>
                <div
                  className="mb-5 flex h-10 w-10 items-center justify-center rounded-md"
                  style={{ backgroundColor: toneBg[feature.tone], color: toneColor[feature.tone] }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-bold" style={{ color: 'var(--tl-text)', fontFamily: '"DM Sans", sans-serif' }}>
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                  {feature.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Features;
