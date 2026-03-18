import React from 'react';
import { Shield, Zap, Globe, Lock, BarChart3, RefreshCw } from 'lucide-react';

const features = [
  {
    icon: Shield,
    title: 'Smart contract escrow',
    description: 'Funds are locked on-chain. No bank, no custodian — just code that both parties can verify.',
  },
  {
    icon: Zap,
    title: 'USDC & SOL support',
    description: 'Accept stablecoin payments in USDC to avoid volatility, or native SOL for lower fees.',
  },
  {
    icon: Globe,
    title: 'Works globally',
    description: 'Send invoices to anyone, anywhere. No bank account required on either side.',
  },
  {
    icon: Lock,
    title: 'Partial payments',
    description: 'Clients can pay in milestones. Release funds incrementally as work is delivered.',
  },
  {
    icon: BarChart3,
    title: 'Dashboard & history',
    description: 'Track all invoices — unpaid, in escrow, and released — from a single dashboard.',
  },
  {
    icon: RefreshCw,
    title: 'Instant settlement',
    description: 'When you release, funds arrive in your wallet in seconds, not days.',
  },
];

const Features: React.FC = () => {
  return (
    <section className="py-20 border-t border-border bg-muted/30">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-semibold text-foreground mb-3">Everything you need</h2>
          <p className="text-muted-foreground text-base max-w-xl mx-auto">
            Built for freelancers and businesses who want crypto payments without the trust problem.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="bg-background rounded-xl p-6 border border-border hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
