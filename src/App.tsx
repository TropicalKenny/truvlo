import React, { useMemo } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  BackpackWalletAdapter,
  CoinbaseWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import NotFound from './pages/NotFound';
import Index from './pages/Index';
import CreateInvoicePage from './pages/CreateInvoicePage';
import PaymentPage from './pages/PaymentPage';
import DashboardPage from './pages/DashboardPage';
import InvalidInvoicePage from './pages/InvalidInvoicePage';
import ApprovePage from './pages/ApprovePage';
import { NotificationProvider } from './components/NotificationProvider';

import '@solana/wallet-adapter-react-ui/styles.css';

const App = () => {
  const endpoint = useMemo(() => clusterApiUrl(WalletAdapterNetwork.Devnet), []);

  // All major Solana wallets — auto-detect any connected wallet
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
    new CoinbaseWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
            <Toaster />
          </NotificationProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export default App;
