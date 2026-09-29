import { BACKUP_STATUS_KEY } from './wallet-backup';
import { deleteSecureItem, getSecureItem, MNEMONIC_STORE_KEY, WALLET_IDENTITY_KEY, WALLET_WIPE_PENDING_KEY } from './storage';
import { wipeTransactions } from './database';
import { homeBalancePreviewStore } from './home-balance-preview-native';
import { clearHederaAccountBindings } from './hedera/account-binding-native';
import { clearAllHederaPaymentJournals } from './hedera/payment-journal-native';
import { clearAllLightningPaymentJournals } from './lightning/payment-journal-native';
import { lightningReceiveStore } from './lightning/receive-store-native';
import { clearBitcoinReceiveArchive } from './bitcoin/receive-archive';
import { bitcoinStore, activateBitcoinStoreAfterWipe, bitcoinDepositWatch, bitcoinRequestCursor, bitcoinDepositCursor, bitcoinStaticAddressCache } from './bitcoin/store-native';
import { clearMoonPayReturnNotice } from './moonpay-return-native';
import { operationalHealth } from './operational-health-native';
import { createWalletWiper } from './wallet-wipe';
import AsyncStorage from '@react-native-async-storage/async-storage';

const wiper = createWalletWiper({
  get: () => getSecureItem(WALLET_WIPE_PENDING_KEY),
  remove: () => deleteSecureItem(WALLET_WIPE_PENDING_KEY),
}, [
  () => homeBalancePreviewStore.clear(),
  () => wipeTransactions(),
  () => clearHederaAccountBindings(),
  () => clearAllHederaPaymentJournals(),
  () => clearAllLightningPaymentJournals(),
  () => lightningReceiveStore.clear(),
  () => bitcoinStore.clear(),
  () => bitcoinDepositWatch.clear(),
  () => bitcoinRequestCursor.clear(),
  () => bitcoinDepositCursor.clear(),
  () => bitcoinStaticAddressCache.clear(),
  () => AsyncStorage.removeItem('opago.bitcoin.static-address.v1'),
  () => clearBitcoinReceiveArchive(),
  () => clearMoonPayReturnNotice(),
  () => operationalHealth.clear(),
  // Remove the protected key last. If any earlier operation fails, startup
  // resumes the pending wipe instead of opening a partially erased wallet.
  () => deleteSecureItem(BACKUP_STATUS_KEY),
  () => deleteSecureItem(WALLET_IDENTITY_KEY),
  () => deleteSecureItem(MNEMONIC_STORE_KEY),
]);

let transition: Promise<unknown> = Promise.resolve();
let activationPending: typeof bitcoinStore | null = null;

export function resumePendingWalletWipe(): Promise<boolean> {
  const result = transition.catch(() => undefined).then(async () => {
    // A second startup caller must wait for activation, not merely for the
    // marker to disappear. Retry activation if it failed after marker removal.
    if (activationPending) {
      await activateBitcoinStoreAfterWipe(activationPending);
      activationPending = null;
      return true;
    }
    const previous = bitcoinStore;
    const completed = await wiper.resumeIfPending();
    // The durable marker is gone only after every deletion step succeeded.
    // Until then the old store remains revocable and retryable.
    if (completed) {
      activationPending = previous;
      await activateBitcoinStoreAfterWipe(previous);
      activationPending = null;
    }
    return completed;
  });
  transition = result.then(() => undefined, () => undefined);
  return result;
}
