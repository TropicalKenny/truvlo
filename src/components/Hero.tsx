import React from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Hero: React.FC = () => {
  const { connected } = useWallet();

  return (
    <section className="py-20 lg:py-32">
      <div className="container">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left - Text */}
          <div className="max-w-xl">
            <h1 className="text-4xl sm:text-5xl font-semibold text-foreground mb-6 leading-tight tracking-tight">
              Escrow-protected invoicing for modern businesses
            </h1>

            <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
              Send invoices, accept USDC or SOL payments, and release funds securely with smart contract escrow. Simple, transparent, and trustless.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              {connected ? (
                <Link to="/create">
                  <Button size="lg" className="w-full sm:w-auto bg-secondary hover:bg-secondary/90 text-secondary-foreground">
                    Create invoice
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <Button size="lg" disabled className="w-full sm:w-auto">
                  Connect wallet to start
                </Button>
              )}

              <Link to="/dashboard">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  View dashboard
                </Button>
              </Link>
            </div>
          </div>

          {/* Right - Invoice Card */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-md">
              <div className="clean-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-sm font-medium text-muted-foreground">Invoice</span>
                  <span className="status-unpaid">
                    Awaiting payment
                  </span>
                </div>

                <div className="mb-6">
                  <p className="text-xs text-muted-foreground mb-1">Amount</p>
                  <p className="text-3xl font-semibold text-foreground">$2,500.00</p>
                  <p className="text-sm text-muted-foreground mt-1">USDC</p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground mb-0.5">Client</p>
                    <p className="text-sm text-foreground">client@company.com</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted">
                    <p className="text-xs text-muted-foreground mb-0.5">Description</p>
                    <p className="text-sm text-foreground">Website redesign - Phase 1</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Created Jan 23, 2026</span>
                    <span className="text-primary font-medium">Escrow ready</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
