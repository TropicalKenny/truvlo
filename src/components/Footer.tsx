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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ['Network', network],
              ['Tokens', 'USDC / SOL'],
              ['Escrow', 'On-chain'],
              ['Disputes', 'Managed review'],
            ].map(([label, value]) => (
              <div key={label} className="trust-panel-subtle px-3 py-2">
                <p className="trust-label">{label}</p>
                <p className="mt-1 trust-mono" style={{ color: 'var(--tl-muted)' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
