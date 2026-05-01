import React from 'react';
import { CheckCircle2, FileText, LockKeyhole, SendHorizonal } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Create invoice',
    description: 'Add scope, amount, token, and client email. Truvlo creates the on-chain escrow record and a shareable payment link.',
    icon: FileText,
  },
  {
    number: '02',
    title: 'Client pays',
    description: 'The client pays with USDC or SOL. Funds move into escrow and both sides can see the payment state.',
    icon: LockKeyhole,
  },
  {
    number: '03',
    title: 'Review and approve',
    description: 'When work is ready, request release. The client approves, raises a dispute, or the timeout path applies.',
    icon: CheckCircle2,
  },
  {
    number: '04',
    title: 'Withdraw funds',
    description: 'Approved funds are released to the selected wallet. Disputed funds stay frozen until the managed review is resolved.',
    icon: SendHorizonal,
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section className="trust-section py-20" style={{ backgroundColor: 'var(--tl-bg-soft)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[0.55fr_1fr] gap-10 lg:gap-16 items-start">
          <div>
            <h2
              className="text-3xl md:text-4xl"
              style={{
                fontFamily: '"Space Grotesk", sans-serif',
                fontWeight: 800,
                color: 'var(--tl-text)',
                letterSpacing: '-0.03em',
              }}
            >
              A clear ledger from invoice to withdrawal
            </h2>
            <p
              className="mt-4 text-base leading-7"
              style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}
            >
              Truvlo keeps fund movement on-chain while invoice context, emails, approvals,
              referrals, and disputes stay in the product workflow where both sides can understand them.
            </p>
          </div>

          <div className="trust-panel overflow-hidden">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="grid grid-cols-[56px_minmax(0,1fr)] gap-4 px-5 py-5 border-b last:border-b-0"
                  style={{ borderColor: 'rgba(148, 163, 184, 0.12)' }}
                >
                  <div className="flex flex-col items-center">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-md"
                      style={{ backgroundColor: index === 1 ? 'rgba(59, 130, 246, 0.14)' : 'var(--tl-teal-soft)', color: index === 1 ? '#93c5fd' : 'var(--tl-teal)' }}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="trust-label">{step.number}</span>
                      <h3 className="text-base font-bold" style={{ fontFamily: '"DM Sans", sans-serif', color: 'var(--tl-text)' }}>
                        {step.title}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-6" style={{ color: 'var(--tl-muted)', fontFamily: '"DM Sans", sans-serif' }}>
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
