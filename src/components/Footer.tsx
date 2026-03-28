import React from 'react';
import { Link } from 'react-router-dom';
import TruvloLogo from './TruvloLogo';

const Footer: React.FC = () => {
  return (
    <footer
      className="border-t py-10"
      style={{
        backgroundColor: '#161B22',
        borderColor: 'rgba(255,255,255,0.08)',
      }}
    >
      <div className="w-full px-6">
        <div className="flex items-center justify-between">
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

          {/* Network — right */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#22C55E' }} />
            <span className="text-xs" style={{ color: '#64748B', fontFamily: '"DM Sans", sans-serif' }}>
              Devnet
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
