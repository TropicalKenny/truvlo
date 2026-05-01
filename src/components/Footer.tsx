import React from 'react';
import TruvloLogo from './TruvloLogo';

const network = import.meta.env.VITE_SOLANA_NETWORK ?? 'Devnet';

const Footer: React.FC = () => {
  return (
    <footer className="border-t py-8" style={{ backgroundColor: 'var(--tl-bg)', borderColor: 'rgba(148, 163, 184, 0.12)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <TruvloLogo size="sm" />
            <p className="mt-2 text-sm" style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>
              On-chain escrow invoices with managed review when work goes sideways.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>
            <span>Built on Solana</span>
            <span aria-hidden="true">/</span>
            <span>{network}</span>
            <span aria-hidden="true">/</span>
            <span>USDC and SOL</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
