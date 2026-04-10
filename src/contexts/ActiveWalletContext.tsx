import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useWallets as useSolanaWallets } from '@privy-io/react-auth/solana';

// Type from Privy — a connected Solana wallet object
type ConnectedSolanaWallet = ReturnType<typeof useSolanaWallets>['wallets'][number];

interface ActiveWalletContextValue {
  activeWallet: ConnectedSolanaWallet | null;
  allWallets: ConnectedSolanaWallet[];
  setActiveWallet: (wallet: ConnectedSolanaWallet) => void;
}

const ActiveWalletContext = createContext<ActiveWalletContextValue>({
  activeWallet: null,
  allWallets: [],
  setActiveWallet: () => {},
});

const STORAGE_KEY = 'escrowpay_active_wallet';

export const ActiveWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { wallets } = useSolanaWallets();
  const [activeWallet, setActiveWalletState] = useState<ConnectedSolanaWallet | null>(null);

  // When wallets array changes (new wallet created/imported or on initial load),
  // restore saved selection or fall back to wallets[0]
  useEffect(() => {
    if (wallets.length === 0) {
      setActiveWalletState(null);
      return;
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    const match = saved ? wallets.find(w => w.address === saved) : null;
    setActiveWalletState(match ?? wallets[0]);
  }, [wallets]);

  const setActiveWallet = useCallback((wallet: ConnectedSolanaWallet) => {
    setActiveWalletState(wallet);
    localStorage.setItem(STORAGE_KEY, wallet.address);
  }, []);

  return (
    <ActiveWalletContext.Provider value={{ activeWallet, allWallets: wallets, setActiveWallet }}>
      {children}
    </ActiveWalletContext.Provider>
  );
};

export const useActiveWallet = () => useContext(ActiveWalletContext);
