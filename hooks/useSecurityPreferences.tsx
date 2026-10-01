import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { securityPreferences } from '@/lib/security-preferences';

export function useSecurityPreferences() {
  const snapshot = useSyncExternalStore(
    securityPreferences.subscribe,
    securityPreferences.getSnapshot,
    securityPreferences.getSnapshot,
  );
  return { ...snapshot, setPreferences: securityPreferences.set };
}

export function SecurityPreferencesProvider({ children }: { children: ReactNode }) {
  const { ready } = useSecurityPreferences();
  useEffect(() => { void securityPreferences.initialize(SecureStore); }, []);
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#0a0a0c', alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator color="#ffb000" />
  </View>;
  return children;
}
