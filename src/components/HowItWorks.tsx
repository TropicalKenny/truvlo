import React from 'react';

const HowItWorks: React.FC = () => {
  const steps = [
    {
      number: '1',
      title: 'Create invoice',
      description: 'Enter amount, description, and client email. Choose USDC or SOL as payment token.',
    },
    {
      number: '2',
      title: 'Client pays',
      description: 'Client receives payment link, connects their wallet, and pays. Full or milestone payments supported.',
    },
    {
      number: '3',
      title: 'Funds held in escrow',
      description: 'Payment is secured in a smart contract until you release it. Non-custodial and transparent.',
    },
    {
      number: '4',
      title: 'Release payment',
      description: 'After work is completed, release funds to your wallet instantly.',
    },
  ];

  return (
    <section className="py-24 bg-muted/30">
      <div className="container">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-3xl font-semibold text-foreground mb-4">
            How it works
          </h2>
          <p className="text-muted-foreground">
            A simple, secure workflow for freelancers and businesses
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step) => (
            <div key={step.number} className="flex flex-col">
              <div className="step-number mb-4">{step.number}</div>
              <h3 className="text-base font-medium text-foreground mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
