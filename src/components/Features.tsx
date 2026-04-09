import React from 'react';
import { Shield, Users, AlertTriangle, Coins, Clock, Star } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Escrow protection',
    body: "Funds leave your client's wallet when they pay. They sit in a smart contract — not our bank account — until both sides are satisfied. No intermediaries.",
  },
  {
    icon: Users,
    title: 'Dual approval',
    body: 'You request release. Client approves. Neither side can move funds unilaterally. A 7-day timeout auto-releases funds if the client goes dark.',
  },
  {
    icon: Coins,
    title: 'Tiered fees',
    body: 'Flat $2 below $200. 1% above. No hidden charges. You receive exactly what the invoice says — no surprises at payout.',
  },
  {
    icon: AlertTriangle,
    title: 'Dispute resolution',
    body: 'Something wrong? Raise a dispute. Funds freeze instantly. A mediator reviews evidence and resolves on-chain. Transparent and final.',
  },
  {
    icon: Clock,
    title: 'Release schedule',
    body: 'Break projects into milestones. Each milestone has its own escrow. Release funds incrementally as deliverables are approved.',
  },
  {
    icon: Star,
    title: 'Reputation',
    body: 'Every completed invoice builds your on-chain reputation score. Verified track record follows your wallet across every client.',
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
        <div className="mb-16">
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

        {/* 3-column feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl p-6 flex flex-col gap-4 transition-transform duration-150 hover:-translate-y-0.5"
                style={{
                  backgroundColor: '#161B22',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                }}
              >
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
                    fontSize: '1.0625rem',
                    color: '#F8FAFC',
                  }}
                >
                  {feature.title}
                </h3>

                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: '#94A3B8',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  {feature.body}
                </p>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div
          className="mt-16 rounded-xl p-10 text-center"
          style={{
            backgroundColor: '#161B22',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
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
              borderRadius: '8px',
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
