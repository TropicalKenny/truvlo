import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';
import { Menu, X, ChevronDown, Copy, Wallet, LogOut, User, FileText } from 'lucide-react';
import TruvloLogo from './TruvloLogo';
import { useToast } from '@/hooks/use-toast';
import { preloadRoute } from '@/lib/routePrefetch';

const Header: React.FC = () => {
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [authDropdownOpen, setAuthDropdownOpen] = useState(false);
  const { ready, authenticated, login, logout } = usePrivy();
  const { activeWallet } = useActiveWallet();
  const { toast } = useToast();

  const handleCopyAddress = async () => {
    const address = activeWallet?.address;
    if (!address) return;
    await navigator.clipboard.writeText(address);
    toast({ title: 'Address copied' });
    setAuthDropdownOpen(false);
  };
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAuthDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const isActive = (path: string) => location.pathname === path;
  const isLanding = location.pathname === '/';

  const walletAddress = activeWallet?.address;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  const navLinks = ready && authenticated
    ? [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/create', label: 'Create Invoice' },
        { to: '/account', label: 'Account' },
      ]
    : [];

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-200 ${
        isLanding && !scrolled
          ? 'bg-transparent border-transparent'
          : 'border-white/[0.08]'
      }`}
      style={{
        backgroundColor:
          isLanding && !scrolled ? 'rgba(8, 12, 15, 0.18)' : 'rgba(8, 12, 15, 0.88)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div className="w-full px-4 sm:px-6 h-16 flex items-center justify-between relative">
        {/* Logo — left */}
        <Link to="/" className="flex items-center flex-shrink-0 z-10">
          <TruvloLogo size="md" />
        </Link>

        {/* Nav — absolutely centered, desktop only */}
        <nav className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onMouseEnter={() => preloadRoute(to)}
              onFocus={() => preloadRoute(to)}
              className={`text-sm font-medium transition-colors duration-150 ${
                isActive(to) ? 'text-[#F8FAFC]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
              }`}
              style={{ fontFamily: '"DM Sans", sans-serif' }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Auth — right (desktop) */}
        <div className="hidden md:flex items-center flex-shrink-0 z-10">
          {!ready ? (
            <div
              aria-hidden="true"
              style={{
                width: '78px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.06)',
              }}
            />
          ) : authenticated ? (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setAuthDropdownOpen(v => !v)}
                className="flex items-center gap-1.5 transition-all duration-150"
                style={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--tl-muted)',
                  backgroundColor: 'rgba(148,163,184,0.06)',
                  border: '1px solid var(--tl-border)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--tl-text)';
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(148,163,184,0.1)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--tl-muted)';
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(148,163,184,0.06)';
                }}
              >
                {shortAddress ?? 'Account'}
                <ChevronDown
                  size={13}
                  style={{
                    transform: authDropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 150ms ease',
                  }}
                />
              </button>

              {authDropdownOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-44 rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: 'var(--tl-surface)',
                    border: '1px solid var(--tl-border)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  <Link
                    to="/account"
                    onMouseEnter={() => preloadRoute('/account')}
                    onFocus={() => preloadRoute('/account')}
                    onClick={() => setAuthDropdownOpen(false)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-white/[0.05]"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <User size={14} />
                    Account
                  </Link>
                  <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  <Link
                    to="/wallet"
                    onMouseEnter={() => preloadRoute('/wallet')}
                    onFocus={() => preloadRoute('/wallet')}
                    onClick={() => setAuthDropdownOpen(false)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-white/[0.05]"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <Wallet size={14} />
                    Wallet
                  </Link>
                  <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  <button
                    onClick={handleCopyAddress}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-white/[0.05]"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Copy size={14} />
                    Copy Address
                  </button>
                  <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.06)' }} />
                  <button
                    onClick={() => { logout(); setAuthDropdownOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm transition-colors duration-150 hover:bg-white/[0.05]"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  >
                    <LogOut size={14} />
                    Disconnect
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => login()}
              style={{
                fontFamily: '"DM Sans", sans-serif',
                fontSize: '14px',
                fontWeight: 600,
                color: '#061110',
                backgroundColor: 'var(--tl-teal)',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 22px',
                cursor: 'pointer',
                transition: 'opacity 150ms ease',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.85')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
            >
              Login
            </button>
          )}
        </div>

        {/* Hamburger — mobile only */}
        <button
          className="md:hidden flex items-center justify-center z-10"
          onClick={() => setMobileOpen(v => !v)}
          style={{
            color: 'var(--tl-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
          }}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile slide-down drawer */}
      {mobileOpen && (
        <div
          className="md:hidden border-t"
          style={{
            backgroundColor: 'rgba(8, 12, 15, 0.98)',
            borderColor: 'rgba(148,163,184,0.12)',
          }}
        >
          <nav className="flex flex-col px-6 py-4 gap-1">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onMouseEnter={() => preloadRoute(to)}
                onFocus={() => preloadRoute(to)}
                className="py-3 text-sm font-medium transition-colors duration-150 border-b"
                style={{
                  fontFamily: '"DM Sans", sans-serif',
                  color: isActive(to) ? '#F8FAFC' : '#94A3B8',
                  textDecoration: 'none',
                  borderColor: 'rgba(255,255,255,0.05)',
                }}
              >
                {label}
              </Link>
            ))}

            <div className="pt-4 pb-2 flex flex-col gap-2">
              {!ready ? (
                <div
                  aria-hidden="true"
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                  }}
                />
              ) : authenticated ? (
                <>
                  <Link
                    to="/settings"
                    onMouseEnter={() => preloadRoute('/settings')}
                    onFocus={() => preloadRoute('/settings')}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 text-sm transition-colors duration-150"
                    style={{
                      color: '#94A3B8',
                      fontFamily: '"DM Sans", sans-serif',
                      textDecoration: 'none',
                      padding: '10px 0',
                    }}
                  >
                    <User size={15} />
                    Profile settings
                  </Link>
                  <Link
                    to="/wallet"
                    onMouseEnter={() => preloadRoute('/wallet')}
                    onFocus={() => preloadRoute('/wallet')}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 text-sm transition-colors duration-150"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none', padding: '10px 0' }}
                  >
                    <Wallet size={15} />
                    Wallet
                  </Link>
                  <Link
                    to="/create"
                    onMouseEnter={() => preloadRoute('/create')}
                    onFocus={() => preloadRoute('/create')}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 text-sm transition-colors duration-150"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', textDecoration: 'none', padding: '10px 0' }}
                  >
                    <FileText size={15} />
                    Create invoice
                  </Link>
                  <button
                    onClick={async () => { await handleCopyAddress(); setMobileOpen(false); }}
                    className="flex items-center gap-2 text-sm transition-colors duration-150"
                    style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', textAlign: 'left' }}
                  >
                    <Copy size={15} />
                    Copy Address
                  </button>
                  <button
                    onClick={() => { logout(); setMobileOpen(false); }}
                    className="flex items-center gap-2 text-sm transition-colors duration-150"
                    style={{
                      color: '#94A3B8',
                      fontFamily: '"DM Sans", sans-serif',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '10px 0',
                      textAlign: 'left',
                    }}
                  >
                    <LogOut size={15} />
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => { login(); setMobileOpen(false); }}
                  className="w-full rounded-lg py-3 text-sm font-medium"
                  style={{
                    backgroundColor: 'var(--tl-teal)',
                    color: '#061110',
                    fontFamily: '"DM Sans", sans-serif',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Login
                </button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
