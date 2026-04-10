import React, { lazy, Suspense, useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';
import NotFound from './pages/NotFound';
import Index from './pages/Index';
import { NotificationProvider } from './components/NotificationProvider';
import WalletOnboarding from './components/WalletOnboarding';

const CreateInvoicePage  = lazy(() => import('./pages/CreateInvoicePage'));
const PaymentPage        = lazy(() => import('./pages/PaymentPage'));
const DashboardPage      = lazy(() => import('./pages/DashboardPage'));
const InvalidInvoicePage = lazy(() => import('./pages/InvalidInvoicePage'));
const ApprovePage        = lazy(() => import('./pages/ApprovePage'));
const ProfilePage            = lazy(() => import('./pages/ProfilePage'));
const ProfileSettingsPage    = lazy(() => import('./pages/ProfileSettingsPage'));
const WalletPage             = lazy(() => import('./pages/WalletPage'));

const App = () => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet'),
    [],
  );
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const needsWallet = authenticated && wallets.length === 0;

  return (
    <ConnectionProvider endpoint={endpoint}>
      <NotificationProvider>
        {needsWallet && <WalletOnboarding />}
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
          <Route path="/profile/:wallet" element={<ProfilePage />} />
          <Route path="/settings" element={<ProfileSettingsPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        <Toaster />
      </NotificationProvider>
    </ConnectionProvider>
  );
};

export default App;
