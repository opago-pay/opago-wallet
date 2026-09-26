import AsyncStorage from '@react-native-async-storage/async-storage';
import { createHederaPaymentJournal, hederaPaymentScope, HEDERA_PAYMENT_JOURNAL_KEY,
  HEDERA_PAYMENT_JOURNAL_V2_PREFIX } from './payment-journal';

const journals = new Map<string, ReturnType<typeof createHederaPaymentJournal>>();
export function hederaPaymentJournalFor(network: 'mainnet' | 'testnet', publicKey: string) {
  const scope = hederaPaymentScope(network, publicKey);
  let journal = journals.get(scope);
  if (!journal) {
    journal = createHederaPaymentJournal(AsyncStorage, scope);
    journals.set(scope, journal);
  }
  return journal;
}
export async function clearAllHederaPaymentJournals() {
  await Promise.all([...journals.values()].map(journal => journal.clear()));
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key === HEDERA_PAYMENT_JOURNAL_KEY ||
    key.startsWith(HEDERA_PAYMENT_JOURNAL_V2_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
