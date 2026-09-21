import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PublicKey } from '@hiero-ledger/sdk';
import { findHederaAccount, loadHederaAccount, type HederaAccountSnapshot } from './account';
import {
  createHederaAccountBinding,
  getHederaAccountBindingStorageKey,
  parseHederaAccountBinding,
  serializeHederaAccountBinding,
} from './account-binding';
import { HEDERA_NETWORK } from './config';
import { normalizeHederaPublicKey } from './keys';
import { isTransientNetworkError } from '../retry';

async function removeCurrentBinding(): Promise<void> {
  await AsyncStorage.removeItem(getHederaAccountBindingStorageKey(HEDERA_NETWORK));
}

async function saveCurrentBinding(account: HederaAccountSnapshot): Promise<void> {
  const binding = createHederaAccountBinding({
    network: HEDERA_NETWORK,
    publicKey: account.publicKey,
    accountId: account.accountId,
  });
  await AsyncStorage.setItem(
    getHederaAccountBindingStorageKey(HEDERA_NETWORK),
    serializeHederaAccountBinding(binding),
  );
}

export async function resolveHederaWalletAccount(
  publicKey: string | PublicKey,
): Promise<HederaAccountSnapshot | null> {
  const normalizedPublicKey = normalizeHederaPublicKey(publicKey);
  const storageKey = getHederaAccountBindingStorageKey(HEDERA_NETWORK);
  const rawBinding = await AsyncStorage.getItem(storageKey);

  if (rawBinding) {
    try {
      const binding = parseHederaAccountBinding(
        rawBinding,
        HEDERA_NETWORK,
        normalizedPublicKey,
      );
      const verified = await loadHederaAccount(binding.accountId, normalizedPublicKey);
      if (verified) return verified;
    } catch (cause) {
      // A connection failure does not invalidate the binding. Rediscovery would
      // repeat the same failing network request and delay the balance again.
      if (isTransientNetworkError(cause)) throw cause;
      // Cached account metadata is never trusted for signing. A malformed,
      // stale, or mismatched binding is discarded and rediscovered on-chain.
    }
    await removeCurrentBinding();
  }

  const discovered = await findHederaAccount(normalizedPublicKey);
  if (discovered) await saveCurrentBinding(discovered);
  return discovered;
}

export async function clearHederaAccountBindings(): Promise<void> {
  await AsyncStorage.multiRemove([
    getHederaAccountBindingStorageKey('testnet'),
    getHederaAccountBindingStorageKey('mainnet'),
  ]);
}
