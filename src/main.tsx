import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { PrivyProvider } from '@privy-io/react-auth';
import { defaultSolanaRpcsPlugin } from '@privy-io/react-auth/solana';

// Make Buffer available globally for Solana libraries
window.Buffer = Buffer;

import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <BrowserRouter>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        plugins: [defaultSolanaRpcsPlugin()],
        loginMethods: ['email'],
        appearance: {
          theme: 'dark',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          showWalletUIs: false,
        },
      }}
    >
      <App />
    </PrivyProvider>
  </BrowserRouter>,
);
