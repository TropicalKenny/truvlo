import type { Wallet } from '@coral-xyz/anchor';
import type { ConnectedStandardSolanaWallet } from '@privy-io/react-auth/solana';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { PRIVY_SOLANA_CHAIN } from './solanaConfig';

type AnchorTransaction = Transaction | VersionedTransaction;
type WalletSource =
  | ConnectedStandardSolanaWallet
  | (() => ConnectedStandardSolanaWallet | null | undefined);

function getWallet(source: WalletSource): ConnectedStandardSolanaWallet | null | undefined {
  return typeof source === 'function' ? source() : source;
}

function serializeTransaction(tx: AnchorTransaction): Uint8Array {
  if (tx instanceof VersionedTransaction) {
    return tx.serialize();
  }

  return tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
}

function deserializeSignedTransaction<T extends AnchorTransaction>(
  originalTx: T,
  signedTransaction: Uint8Array,
): T {
  return (originalTx instanceof VersionedTransaction
    ? VersionedTransaction.deserialize(signedTransaction)
    : Transaction.from(signedTransaction)) as T;
}

async function signPrivyTransaction<T extends AnchorTransaction>(
  walletSource: WalletSource,
  tx: T,
): Promise<T> {
  const privyWallet = getWallet(walletSource);
  if (!privyWallet) throw new Error('Wallet disconnected');

  const { signedTransaction } = await privyWallet.signTransaction({
    transaction: serializeTransaction(tx),
    address: privyWallet.address,
    chain: PRIVY_SOLANA_CHAIN,
  });

  return deserializeSignedTransaction(tx, signedTransaction);
}

export function createPrivySolanaAnchorWallet(
  walletSource: WalletSource,
  publicKeyOverride?: PublicKey,
): Wallet {
  const privyWallet = getWallet(walletSource);
  const publicKey = publicKeyOverride ?? (privyWallet ? new PublicKey(privyWallet.address) : null);
  if (!publicKey) throw new Error('Wallet disconnected');

  return {
    publicKey,
    signTransaction: <T extends AnchorTransaction>(tx: T) => signPrivyTransaction(walletSource, tx),
    signAllTransactions: <T extends AnchorTransaction>(txs: T[]) =>
      Promise.all(txs.map((tx) => signPrivyTransaction(walletSource, tx))),
  };
}
