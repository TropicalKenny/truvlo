import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Buffer } from 'buffer';
import { PrivyProvider } from '@privy-io/react-auth';
import { createSolanaRpc, createSolanaRpcSubscriptions } from '@solana/kit';
import { getSolanaRpcUrl, PRIVY_SOLANA_CHAIN } from './lib/solanaConfig';

// Make Buffer available globally for Solana libraries
window.Buffer = Buffer;

import App from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const solanaRpcUrl = getSolanaRpcUrl();
const solanaRpcSubscriptionsUrl = solanaRpcUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

createRoot(rootElement).render(
  <BrowserRouter>
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID}
      config={{
        loginMethods: ['email'],
        appearance: {
          theme: 'dark',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          showWalletUIs: false,
        },
        solana: {
          rpcs: {
            [PRIVY_SOLANA_CHAIN]: {
              rpc: createSolanaRpc(solanaRpcUrl),
              rpcSubscriptions: createSolanaRpcSubscriptions(solanaRpcSubscriptionsUrl),
              blockExplorerUrl: 'https://explorer.solana.com',
            },
          },
        },
      }}
    >
      <App />
    </PrivyProvider>
  </BrowserRouter>,
);
