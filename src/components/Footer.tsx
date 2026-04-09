import React from 'react';
import { Link } from 'react-router-dom';
import TruvloLogo from './TruvloLogo';

const network = import.meta.env.VITE_SOLANA_NETWORK ?? 'Devnet';

const Footer: React.FC = () => {
  return (
    <footer
      className="border-t py-10"
      style={{
        backgroundColor: '#161B22',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          {/* Brand — left */}
          <div className="flex flex-col gap-1">
            <TruvloLogo size="sm" />
            <p
              className="text-sm"
              style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}
            >
              Escrow-protected invoicing on Solana.
            </p>
          </div>

          {/* Nav links — right */}
          <nav className="flex items-center gap-6">
            <Link
              to="/dashboard"
              className="text-sm transition-colors duration-150 hover:text-white"
              style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
            >
              Dashboard
            </Link>
            <Link
              to="/create"
              className="text-sm transition-colors duration-150 hover:text-white"
              style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
            >
              Create Invoice
            </Link>
            <a
              href="https://github.com/TropicalKenny/escrowpay"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm transition-colors duration-150 hover:text-white"
              style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none' }}
            >
              GitHub
            </a>
          </nav>
        </div>

        {/* Bottom line */}
        <div
          className="mt-8 pt-6 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <span
            className="text-xs"
            style={{ color: '#475569', fontFamily: '"DM Sans", sans-serif' }}
          >
            Built on Solana · {network}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#22C55E' }} />
            <span className="text-xs" style={{ color: '#475569', fontFamily: '"DM Sans", sans-serif' }}>
              {network}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
