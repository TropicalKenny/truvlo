import React from 'react';
import { FileText, ShieldCheck, Unlock } from 'lucide-react';

const steps = [
  {
    icon: FileText,
    step: '01',
    title: 'Create an invoice',
    description: 'Set the amount in USDC or SOL, add a description, and enter your client\'s email. A unique payment link is generated instantly.',
  },
  {
    icon: ShieldCheck,
    step: '02',
    title: 'Client pays into escrow',
    description: 'Your client clicks the link and pays. Funds are locked in a smart contract on Solana — neither party can touch them until work is approved.',
  },
  {
    icon: Unlock,
    step: '03',
    title: 'Release when ready',
    description: 'Once the work is delivered and approved, you release the funds to your wallet. No middleman, no chargebacks, no delays.',
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section className="py-20 border-t border-border">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold text-foreground mb-3">How it works</h2>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            Three steps from invoice to payment — fully on-chain, fully trustless.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop only) */}
          <div className="hidden md:block absolute top-8 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px bg-border" />

          {steps.map(({ icon: Icon, step, title, description }) => (
            <div key={step} className="flex flex-col items-center text-center relative">
              <div className="relative mb-5">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Icon className="h-7 w-7 text-primary" />
                </div>
                <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                  {parseInt(step)}
                </span>
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
