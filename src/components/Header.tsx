import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import TruvloLogo from './TruvloLogo';

const Header: React.FC = () => {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (path: string) => location.pathname === path;
  const isLanding = location.pathname === '/';

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-200 ${
        isLanding && !scrolled
          ? 'bg-transparent border-transparent'
          : 'border-white/[0.08]'
      }`}
      style={{
        backgroundColor:
          isLanding && !scrolled ? 'transparent' : 'rgba(22, 27, 34, 0.9)',
        backdropFilter: isLanding && !scrolled ? 'none' : 'blur(12px)',
      }}
    >
      <div className="w-full px-6 h-16 flex items-center justify-between relative">
        {/* Logo — left */}
        <Link to="/" className="flex items-center flex-shrink-0 z-10">
          <TruvloLogo size="md" />
        </Link>

        {/* Nav — absolutely centered relative to full header width */}
        <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          <Link
            to="/"
            className={`text-sm font-medium transition-colors duration-150 ${
              isActive('/') ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Home
          </Link>
          <Link
            to="/dashboard"
            className={`text-sm font-medium transition-colors duration-150 ${
              isActive('/dashboard') ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Dashboard
          </Link>
          <Link
            to="/create"
            className={`text-sm font-medium transition-colors duration-150 ${
              isActive('/create') ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
            }`}
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            Create Invoice
          </Link>
        </nav>

        {/* Wallet — right */}
        <div className="flex-shrink-0 z-10">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
};

export default Header;
