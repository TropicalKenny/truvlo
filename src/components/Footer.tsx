import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="border-t border-border py-12">
      <div className="container">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-sm">
            <span className="font-medium text-foreground">EscrowPay</span>
            <span className="text-muted-foreground">
              Secure USDC & SOL invoicing with escrow protection
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-accent" />
            Devnet
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
