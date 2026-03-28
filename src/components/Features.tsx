import React from 'react';
import { Shield, Users, AlertTriangle, Coins } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'On-chain escrow',
    body: "Funds leave your client's wallet when they pay. They sit in a smart contract — not our bank account — until you're both satisfied. No intermediaries. No trust required.",
    stat: '100%',
    statLabel: 'non-custodial',
    flip: false,
  },
  {
    icon: Users,
    title: 'Dual approval',
    body: "You request release. Client approves. Neither side can move funds unilaterally. A 7-day timeout protects you if the client goes dark — funds auto-release after the window.",
    stat: '7 days',
    statLabel: 'auto-release window',
    flip: true,
  },
  {
    icon: AlertTriangle,
    title: 'Dispute protection',
    body: 'Something wrong? Raise a dispute. Funds freeze instantly. A mediator reviews the evidence and resolves — on-chain and transparent. No emails to ignore, no ghosting.',
    stat: '0',
    statLabel: 'funds lost to disputes',
    flip: false,
  },
  {
    icon: Coins,
    title: 'USDC + SOL',
    body: 'Invoice in USDC for stable value. Accept SOL for speed. Platform fee is 1% above $200 — flat $2 below. You receive exactly what the invoice says. No surprises.',
    stat: '1%',
    statLabel: 'platform fee above $200',
    flip: true,
  },
];

const Features: React.FC = () => {
  return (
    <section
      className="py-24"
      style={{ backgroundColor: '#0D1117' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Heading */}
        <div className="mb-20">
          <h2
            className="text-3xl md:text-4xl"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
            }}
          >
            Built for freelancers who've been burned.
          </h2>
          <p
            className="text-base mt-3 max-w-lg"
            style={{
              color: '#64748B',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Every feature exists because a freelancer lost money without it.
          </p>
        </div>

        {/* Feature rows */}
        <div className="space-y-16">
          {features.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className={`grid grid-cols-1 md:grid-cols-2 gap-10 items-center ${
                  feature.flip ? 'md:[&>*:first-child]:order-last' : ''
                }`}
                // GRID BREAK: Feature 1 has deliberate heavy top padding
                style={i === 0 ? { paddingTop: '8px' } : undefined}
              >
                {/* Text side */}
                <div
                  className="flex flex-col gap-5"
                  // LAYOUT BREAK on first feature: heavy top, light bottom
                  style={i === 0 ? { paddingTop: '40px', paddingBottom: '8px' } : undefined}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: 'rgba(45,212,191,0.1)' }}
                    >
                      <Icon size={18} style={{ color: '#2DD4BF' }} />
                    </div>
                    <h3
                      style={{
                        fontFamily: '"Space Grotesk", sans-serif',
                        fontWeight: 500,
                        fontSize: '1.125rem',
                        color: '#F8FAFC',
                      }}
                    >
                      {feature.title}
                    </h3>
                  </div>

                  <p
                    className="text-base leading-relaxed"
                    style={{
                      color: '#94A3B8',
                      fontFamily: '"DM Sans", sans-serif',
                    }}
                  >
                    {feature.body}
                  </p>
                </div>

                {/* Visual side — dark stat card */}
                <div
                  className="rounded-xl p-8 flex flex-col gap-2"
                  style={{
                    backgroundColor: '#161B22',
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderLeft: '4px solid rgba(45,212,191,0.3)',
                  }}
                >
                  <p
                    style={{
                      fontFamily: '"Space Grotesk", sans-serif',
                      fontWeight: 700,
                      fontSize: '3.5rem',
                      color: '#F8FAFC',
                      letterSpacing: '-0.03em',
                      lineHeight: 1,
                    }}
                  >
                    {feature.stat}
                  </p>
                  <p
                    className="text-sm uppercase tracking-widest"
                    style={{
                      color: '#64748B',
                      fontFamily: '"DM Sans", sans-serif',
                      letterSpacing: '0.08em',
                    }}
                  >
                    {feature.statLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div
          className="mt-24 rounded-xl p-10 text-center"
          style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <h3
            className="text-2xl md:text-3xl mb-3"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
            }}
          >
            Your next invoice should be the last one you worry about.
          </h3>
          <p
            className="text-base mb-8"
            style={{
              color: '#94A3B8',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Connect your wallet and create your first escrow invoice in under a minute.
          </p>
          <a
            href="/create"
            className="inline-flex items-center justify-center rounded-lg font-medium transition-opacity duration-150 hover:opacity-90"
            style={{
              backgroundColor: '#2DD4BF',
              color: '#0D1117',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 500,
              fontSize: '15px',
              padding: '13px 32px',
              textDecoration: 'none',
            }}
          >
            Create Invoice — it's free
          </a>
        </div>
      </div>
    </section>
  );
};

export default Features;
