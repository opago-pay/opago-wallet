import AsyncStorage from '@react-native-async-storage/async-storage';
import { observeTransactionRate } from '../transaction-rates-native';
import { walletSession } from '../wallet-session';
import { createLightningPaymentJournal, lightningPaymentScope, LIGHTNING_PAYMENT_JOURNAL_KEY,
  LIGHTNING_PAYMENT_JOURNAL_V2_PREFIX } from './payment-journal';

const journals = new Map<string, ReturnType<typeof createLightningPaymentJournal>>();
export function lightningPaymentJournalFor(network: 'MAINNET' | 'REGTEST', publicKey: string) {
  const scope = lightningPaymentScope(network, publicKey);
  let journal = journals.get(scope);
  if (!journal) {
    const original = createLightningPaymentJournal(AsyncStorage, scope);
    journal = { ...original, async recordPending(paymentHash, amountSats) {
      let assertRateSession: (() => void) | null = null;
      try { assertRateSession = walletSession.captureRuntime(); } catch { /* Optional valuation. */ }
      await original.recordPending(paymentHash, amountSats);
      if (assertRateSession) observeTransactionRate({ scope: 'btc:' + scope, key: 'ln:' + paymentHash.trim().toLowerCase(), asset: 'BTC',
        transactionAt: new Date().toISOString(), timeBasis: 'recorded' }, assertRateSession);
    } };
    journals.set(scope, journal);
  }
  return journal;
}
export async function clearAllLightningPaymentJournals() {
  await Promise.all([...journals.values()].map(journal => journal.clear()));
  const keys = (await AsyncStorage.getAllKeys()).filter(key => key === LIGHTNING_PAYMENT_JOURNAL_KEY ||
    key.startsWith(LIGHTNING_PAYMENT_JOURNAL_V2_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys);
}
