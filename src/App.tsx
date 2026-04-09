import React, { useMemo } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider } from '@solana/wallet-adapter-react';
import { clusterApiUrl } from '@solana/web3.js';
import NotFound from './pages/NotFound';
import Index from './pages/Index';
import CreateInvoicePage from './pages/CreateInvoicePage';
import PaymentPage from './pages/PaymentPage';
import DashboardPage from './pages/DashboardPage';
import InvalidInvoicePage from './pages/InvalidInvoicePage';
import ApprovePage from './pages/ApprovePage';
import ProfilePage from './pages/ProfilePage';
import { NotificationProvider } from './components/NotificationProvider';

const App = () => {
  const endpoint = useMemo(
    () => import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl('devnet'),
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <NotificationProvider>
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
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </NotificationProvider>
    </ConnectionProvider>
  );
};

export default App;
