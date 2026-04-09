import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import TruvloLogo from './TruvloLogo';

const Header: React.FC = () => {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { authenticated, login, logout } = usePrivy();
  const { wallets } = useSolanaWallets();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (path: string) => location.pathname === path;
  const isLanding = location.pathname === '/';

  const walletAddress = wallets[0]?.address;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

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

        {/* Auth — right */}
        <div className="flex-shrink-0 z-10">
          {authenticated ? (
            <button
              onClick={() => logout()}
              style={{
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                color: '#94A3B8',
                backgroundColor: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '8px 14px',
                cursor: 'pointer',
                transition: 'color 150ms ease, background-color 150ms ease',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.color = '#F8FAFC';
                (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.1)';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.color = '#94A3B8';
                (e.target as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.06)';
              }}
            >
              {shortAddress ?? 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={() => login()}
              style={{
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '13px',
                fontWeight: 500,
                color: '#0D1117',
                backgroundColor: '#2DD4BF',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                cursor: 'pointer',
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={e => ((e.target as HTMLButtonElement).style.opacity = '0.85')}
              onMouseLeave={e => ((e.target as HTMLButtonElement).style.opacity = '1')}
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
