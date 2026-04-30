import React, { lazy, Suspense, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import NotFound from './pages/NotFound';
import Index from './pages/Index';
import ReferralBootstrap from './components/ReferralBootstrap';
import { NotificationProvider } from './components/NotificationProvider';
import { ActiveWalletProvider } from './contexts/ActiveWalletContext';
import { AuthProfileProvider } from './contexts/AuthProfileContext';
import { getSolanaRpcUrl } from './lib/solanaConfig';
import OnboardingGate from './components/OnboardingGate';

const CreateInvoicePage      = lazy(() => import('./pages/CreateInvoicePage'));
const PaymentPage            = lazy(() => import('./pages/PaymentPage'));
const DashboardPage          = lazy(() => import('./pages/DashboardPage'));
const InvalidInvoicePage     = lazy(() => import('./pages/InvalidInvoicePage'));
const ApprovePage            = lazy(() => import('./pages/ApprovePage'));
const ProfilePage            = lazy(() => import('./pages/ProfilePage'));
const AccountPage            = lazy(() => import('./pages/AccountPage'));
const ProfileSettingsPage    = lazy(() => import('./pages/ProfileSettingsPage'));
const WalletPage             = lazy(() => import('./pages/WalletPage'));
const CombinedProfilePage    = lazy(() => import('./pages/CombinedProfilePage'));
const OnboardingPage         = lazy(() => import('./pages/OnboardingPage'));

const App = () => {
  const endpoint = useMemo(() => getSolanaRpcUrl(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <ActiveWalletProvider>
        <AuthProfileProvider>
          <NotificationProvider>
            <ReferralBootstrap />
            <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0D1117' }} />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/pay/:invoiceId/:creator" element={<PaymentPage />} />
                <Route path="/invoice/:invoiceId/:creator" element={<PaymentPage />} />
                <Route path="/invoice/:invoiceId" element={<InvalidInvoicePage />} />
                <Route path="/pay/:invoiceId" element={<InvalidInvoicePage />} />
                <Route path="/onboarding" element={<OnboardingGate onboardingPage><OnboardingPage /></OnboardingGate>} />
                <Route path="/dashboard" element={<OnboardingGate><DashboardPage /></OnboardingGate>} />
                <Route path="/approve/:invoiceId/:creator" element={<ApprovePage />} />
                <Route path="/account" element={<OnboardingGate><AccountPage /></OnboardingGate>} />
                {/* /profile/account/:slug must come before /profile/:wallet */}
                <Route path="/profile/account/:slug" element={<CombinedProfilePage />} />
                <Route path="/profile/:wallet" element={<ProfilePage />} />
                <Route path="/settings" element={<OnboardingGate><ProfileSettingsPage /></OnboardingGate>} />
                <Route path="/wallet" element={<OnboardingGate><WalletPage /></OnboardingGate>} />
                <Route path="/create" element={<OnboardingGate><CreateInvoicePage /></OnboardingGate>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <Toaster />
          </NotificationProvider>
        </AuthProfileProvider>
      </ActiveWalletProvider>
    </ConnectionProvider>
  );
};

export default App;
