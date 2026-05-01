import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
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

  const checkingProfile = authenticated && (!profileReady || (profileLoading && !profile));
  const profileComplete = !!profile?.onboarding_completed_at;
  const walletComplete = allWallets.length > 0;
  const onboardingComplete = !authenticated || (profileComplete && walletComplete);

  if (!ready || checkingProfile) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }} />;
  }

  if (authenticated && !onboardingComplete && !onboardingPage) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  if (authenticated && onboardingComplete && onboardingPage) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default OnboardingGate;
