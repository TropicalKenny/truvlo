import React from 'react';

const steps = [
  {
    number: '01',
    title: 'Create invoice',
    description: 'Connect your wallet, set the amount, and add your client email. The invoice goes on-chain in seconds.',
  },
  {
    number: '02',
    title: 'Client pays',
    description: "Your client receives a payment link and locks funds in escrow. You are protected once payment lands.",
  },
  {
    number: '03',
    title: 'Work is done',
    description: 'Deliver your work. Request withdrawal when you are ready. Both sides can review the same payment state.',
  },
  {
    number: '04',
    title: 'Funds withdrawn',
    description: 'Client approves, or the platform resolves a dispute, then funds go straight to your wallet.',
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section className="py-24" style={{ backgroundColor: '#161B22' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl md:text-4xl mb-4"
            style={{
              fontFamily: '"Space Grotesk", sans-serif',
              fontWeight: 700,
              color: '#F8FAFC',
              letterSpacing: '-0.02em',
            }}
          >
            How{' '}
            <em
              style={{
                fontStyle: 'italic',
                color: '#2DD4BF',
                fontFamily: '"Space Grotesk", sans-serif',
              }}
            >
              Truvlo
            </em>{' '}
            works
          </h2>
          <p
            className="text-base max-w-md mx-auto"
            style={{
              color: '#64748B',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            Four steps. On-chain settlement with managed review when a deal goes sideways.
          </p>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-4 gap-0">
          {steps.map((step, i) => (
            <div key={step.number} className="relative flex flex-col">
              {i < steps.length - 1 && (
                <div
                  className="hidden md:block absolute top-10 left-1/2 w-full h-px"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    transform: 'translateX(50%)',
                    zIndex: 0,
                  }}
                />
              )}

              {i < steps.length - 1 && (
                <div
                  className="md:hidden absolute left-10 top-full w-px h-4"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    zIndex: 0,
                  }}
                />
              )}

              <div
                className="relative rounded-xl p-6 mx-2 md:mx-2 flex flex-col gap-4 mb-4 md:mb-0"
                style={{
                  backgroundColor: '#0D1117',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontWeight: 700,
                    fontSize: '2.5rem',
                    color: 'rgba(45,212,191,0.15)',
                    lineHeight: 1,
                    letterSpacing: '-0.02em',
                  }}
                >
                  {step.number}
                </div>

                <h3
                  style={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontWeight: 500,
                    fontSize: '1.0625rem',
                    color: '#F8FAFC',
                    marginTop: '-8px',
                  }}
                >
                  {step.title}
                </h3>

                <p
                  className="text-sm leading-relaxed"
                  style={{
                    color: '#94A3B8',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
