import { clusterApiUrl } from '@solana/web3.js';

export const SOLANA_CLUSTER = 'devnet';
export const PRIVY_SOLANA_CHAIN = `solana:${SOLANA_CLUSTER}` as const;

export function getSolanaRpcUrl(): string {
  return import.meta.env.VITE_SOLANA_RPC_URL || clusterApiUrl(SOLANA_CLUSTER);
}

export function getSolanaExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}

export function getSolanaExplorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${SOLANA_CLUSTER}`;
}
