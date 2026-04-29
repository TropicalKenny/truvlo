import React, { lazy, Suspense, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import NotFound from './pages/NotFound';
import Index from './pages/Index';
import ReferralBootstrap from './components/ReferralBootstrap';
import { NotificationProvider } from './components/NotificationProvider';
import { ActiveWalletProvider } from './contexts/ActiveWalletContext';
import { getSolanaRpcUrl } from './lib/solanaConfig';

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

const App = () => {
  const endpoint = useMemo(() => getSolanaRpcUrl(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <ActiveWalletProvider>
        <NotificationProvider>
          <ReferralBootstrap />
          <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0D1117' }} />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/create" element={<CreateInvoicePage />} />
              <Route path="/pay/:invoiceId/:creator" element={<PaymentPage />} />
              <Route path="/invoice/:invoiceId/:creator" element={<PaymentPage />} />
              <Route path="/invoice/:invoiceId" element={<InvalidInvoicePage />} />
              <Route path="/pay/:invoiceId" element={<InvalidInvoicePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/approve/:invoiceId/:creator" element={<ApprovePage />} />
              <Route path="/account" element={<AccountPage />} />
              {/* /profile/account/:slug must come before /profile/:wallet */}
              <Route path="/profile/account/:slug" element={<CombinedProfilePage />} />
              <Route path="/profile/:wallet" element={<ProfilePage />} />
              <Route path="/settings" element={<ProfileSettingsPage />} />
              <Route path="/wallet" element={<WalletPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          <Toaster />
        </NotificationProvider>
      </ActiveWalletProvider>
    </ConnectionProvider>
  );
};

export default App;
