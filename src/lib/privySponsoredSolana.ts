import type { ConnectedStandardSolanaWallet } from '@privy-io/react-auth/solana';
import bs58 from 'bs58';
import { PRIVY_SOLANA_CHAIN } from './solanaConfig';

type SignAndSendTransaction = (input: {
  transaction: Uint8Array;
  wallet: ConnectedStandardSolanaWallet;
  chain?: typeof PRIVY_SOLANA_CHAIN;
  options?: {
    sponsor?: boolean;
  };
}) => Promise<{ signature: Uint8Array | string }>;

export function normalizeSolanaSignature(signature: Uint8Array | string): string {
  if (typeof signature === 'string') return signature;
  return bs58.encode(signature);
}

export async function sendSponsoredSolanaTransaction(
  signAndSendTransaction: SignAndSendTransaction,
  wallet: ConnectedStandardSolanaWallet,
  transaction: Uint8Array,
): Promise<string> {
  const result = await signAndSendTransaction({
    transaction,
    wallet,
    chain: PRIVY_SOLANA_CHAIN,
    options: { sponsor: true },
  });

  return normalizeSolanaSignature(result.signature);
}
