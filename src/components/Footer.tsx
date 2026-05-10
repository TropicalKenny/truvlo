import React from 'react';
import TruvloLogo from './TruvloLogo';

const Footer: React.FC = () => {
  return (
    <footer className="border-t py-8" style={{ backgroundColor: 'var(--tl-bg)', borderColor: 'rgba(148, 163, 184, 0.12)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <TruvloLogo size="sm" />
            <p className="mt-2 text-sm" style={{ color: 'var(--tl-dim)', fontFamily: '"DM Sans", sans-serif' }}>
              Programmable escrow for AI agents, freelancers, and cross-border internet work.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
