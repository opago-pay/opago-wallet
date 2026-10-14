import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bitcoinOnlyPreference } from '@/lib/bitcoin-only';

export function useBitcoinOnly() {
  const snapshot = useSyncExternalStore(bitcoinOnlyPreference.subscribe,
    bitcoinOnlyPreference.getSnapshot, bitcoinOnlyPreference.getSnapshot);
  return { ...snapshot, setBitcoinOnly: bitcoinOnlyPreference.setBitcoinOnly };
}
export function BitcoinOnlyProvider({ children }: { children: ReactNode }) {
  useEffect(() => { void bitcoinOnlyPreference.initialize(AsyncStorage); }, []);
  return children;
}
