import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';

interface OnboardingGateProps {
  children: React.ReactNode;
  onboardingPage?: boolean;
}

type GateState = 'checking' | 'complete' | 'incomplete';

const OnboardingGate: React.FC<OnboardingGateProps> = ({ children, onboardingPage = false }) => {
  const { authenticated, ready, getAccessToken } = usePrivy();
  const location = useLocation();
  const [state, setState] = useState<GateState>('checking');

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      setState('complete');
      return;
    }

    let cancelled = false;
    const loadProfile = async () => {
      setState('checking');
      try {
        const token = await getAccessToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/profile', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok || cancelled) {
          setState('complete');
          return;
        }
        const data = await res.json() as { onboarding_completed_at: string | null };
        setState(data.onboarding_completed_at ? 'complete' : 'incomplete');
      } catch {
        if (!cancelled) setState('complete');
      }
    };

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, ready, location.pathname]);

  if (!ready || state === 'checking') {
    return <div style={{ minHeight: '100vh', backgroundColor: '#0D1117' }} />;
  }

  if (authenticated && state === 'incomplete' && !onboardingPage) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  if (authenticated && state === 'complete' && onboardingPage) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default OnboardingGate;
