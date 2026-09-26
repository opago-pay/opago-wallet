import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStaticAddressCache } from './static-address-cache';
import { openDatabaseAsync } from 'expo-sqlite';
import { createBitcoinSqliteStore } from './store-sqlite';
import { createDepositWatch } from './deposit-watch';
import { createBitcoinRequestCursor } from './request-cursor';
import { createBitcoinDepositCursor } from './deposit-cursor';
import { deleteSecureItem, getSecureItem, setSecureItem } from '../storage';
function newBitcoinStore() {
  return createBitcoinSqliteStore(
    () => openDatabaseAsync('opago-bitcoin-operations.db'), AsyncStorage);
}

// ES module imports observe the replacement after a completed wallet wipe.
// A consumer that already captured the previous instance keeps a revoked
// handle, so delayed work cannot start writing into the next wallet's store.
export let bitcoinStore = newBitcoinStore();

export async function activateBitcoinStoreAfterWipe(previous: typeof bitcoinStore): Promise<void> {
  if (bitcoinStore !== previous) throw new Error('Bitcoin store changed during wallet wipe.');
  await previous.retireAfterWipe();
  if (bitcoinStore !== previous) throw new Error('Bitcoin store changed during wallet wipe.');
  bitcoinStore = newBitcoinStore();
}
export const bitcoinDepositWatch = createDepositWatch(AsyncStorage);
export const bitcoinRequestCursor = createBitcoinRequestCursor(AsyncStorage);
export const bitcoinDepositCursor = createBitcoinDepositCursor(AsyncStorage);
// A receive address may be shown to another wallet or a buy provider. Do not
// trust the legacy plaintext AsyncStorage cache after an app-data restore/edit.
export const bitcoinStaticAddressCache = createStaticAddressCache({
  getItem: getSecureItem,
  setItem: setSecureItem,
  removeItem: deleteSecureItem,
});
