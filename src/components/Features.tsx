import React from 'react';
import { Shield, DollarSign, Globe, Wallet } from 'lucide-react';

const Features: React.FC = () => {
  const features = [
    {
      icon: Shield,
      title: 'Non-custodial escrow',
      description: 'Funds are held by smart contracts. You maintain full control with trustless security.',
    },
    {
      icon: DollarSign,
      title: 'USDC & SOL support',
      description: 'Choose your preferred token. USDC for stability, SOL for native Solana payments.',
    },
    {
      icon: Globe,
      title: 'Global payments',
      description: 'Accept payments from anywhere. No borders, no bank delays, minimal fees.',
    },
    {
      icon: Wallet,
      title: 'Milestone payments',
      description: 'Clients can pay in installments. Release funds as work is completed.',
    },
  ];

  return (
    <section className="py-24">
      <div className="container">
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <h2 className="text-3xl font-semibold text-foreground mb-4">
            Built for trust
          </h2>
          <p className="text-muted-foreground">
            Modern payment infrastructure for the decentralized economy
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {features.map((feature, index) => (
            <div key={index} className="flex flex-col">
              <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-foreground" strokeWidth={1.5} />
              </div>
              <h3 className="text-base font-medium text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Coming Soon */}
        <div className="p-6 rounded-lg border border-dashed border-border">
          <p className="text-center text-sm text-muted-foreground">
            <span className="font-medium">Coming soon:</span> Multi-wallet support, advanced milestone enforcement, and dispute resolution
          </p>
        </div>
      </div>
    </section>
  );
};

export default Features;
