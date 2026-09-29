import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { languagePreference } from '@/lib/i18n/language';

export function useLanguage() {
  const snapshot = useSyncExternalStore(languagePreference.subscribe, languagePreference.getSnapshot, languagePreference.getSnapshot);
  return { ...snapshot, setLanguage: languagePreference.setLanguage };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { ready } = useLanguage();
  useEffect(() => {
    let locale = 'en';
    try { locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch { /* English fallback. */ }
    void languagePreference.initialize(AsyncStorage, locale);
  }, []);
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#0a0a0c', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#ffb000" /></View>;
  return children;
}
