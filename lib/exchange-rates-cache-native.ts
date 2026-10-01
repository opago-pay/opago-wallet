import AsyncStorage from '@react-native-async-storage/async-storage';

// Public market prices only: no wallet identifiers, balances or credentials.
const KEY = 'opago_exchange_rates_v1';
let writes: Promise<void> = Promise.resolve();

export const exchangeRateCacheStorage = {
  read: (): Promise<string | null> => AsyncStorage.getItem(KEY),
  write: (raw: string): Promise<void> => {
    const operation = writes.catch(() => undefined).then(() => AsyncStorage.setItem(KEY, raw));
    writes = operation;
    return operation;
  },
};
