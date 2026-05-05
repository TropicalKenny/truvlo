import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { useAuthProfile } from '@/contexts/AuthProfileContext';
import { useActiveWallet } from '@/contexts/ActiveWalletContext';

interface OnboardingGateProps {
  children: React.ReactNode;
  onboardingPage?: boolean;
}

const OnboardingGate: React.FC<OnboardingGateProps> = ({ children, onboardingPage = false }) => {
  const { authenticated, ready } = usePrivy();
  const { profile, profileReady, profileLoading } = useAuthProfile();
  const { allWallets } = useActiveWallet();
  const location = useLocation();
  const dismissKey = 'truvlo_setup_prompt_dismissed';
  const [setupPromptDismissed, setSetupPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(dismissKey) === 'true';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (location.pathname === '/onboarding') setSetupPromptDismissed(false);
  }, [location.pathname]);

  const checkingProfile = authenticated && (!profileReady || (profileLoading && !profile));
  const profileComplete = !!profile?.onboarding_completed_at;
  const walletComplete = allWallets.length > 0;
  const onboardingComplete = !authenticated || (profileComplete && walletComplete);
  const showSetupPrompt = authenticated
    && !onboardingComplete
    && !onboardingPage
    && location.pathname !== '/admin'
    && !setupPromptDismissed;

  if (!ready || checkingProfile) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }} />;
  }

  if (authenticated && onboardingComplete && onboardingPage) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <>
      {children}
      {showSetupPrompt && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 18,
            transform: 'translateX(-50%)',
            width: 'min(560px, calc(100vw - 32px))',
            zIndex: 60,
            borderRadius: 8,
            border: '1px solid rgba(45, 212, 191, 0.28)',
            background: 'rgba(13, 17, 23, 0.96)',
            boxShadow: '0 18px 44px rgba(0, 0, 0, 0.35)',
            padding: '14px 16px',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div>
            <p style={{ color: '#F8FAFC', fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 700 }}>
              Finish setup when you are ready
            </p>
            <p style={{ color: '#94A3B8', fontFamily: '"DM Sans", sans-serif', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
              You can explore Truvlo now. Add a display name, email, and wallet before sending invoices or receiving alerts.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link
              to="/onboarding"
              state={{ from: location.pathname }}
              style={{
                borderRadius: 8,
                background: '#2DD4BF',
                color: '#0D1117',
                fontFamily: '"DM Sans", sans-serif',
                fontSize: 12,
                fontWeight: 800,
                padding: '9px 12px',
                whiteSpace: 'nowrap',
              }}
            >
              Finish setup
            </Link>
            <button
              type="button"
              onClick={() => {
                setSetupPromptDismissed(true);
                try { window.localStorage.setItem(dismissKey, 'true'); } catch { /* ignore */ }
              }}
              style={{
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.22)',
                background: 'transparent',
                color: '#94A3B8',
                fontFamily: '"DM Sans", sans-serif',
                fontSize: 12,
                fontWeight: 700,
                padding: '9px 12px',
                whiteSpace: 'nowrap',
              }}
            >
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default OnboardingGate;
