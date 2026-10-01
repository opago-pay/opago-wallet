import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, Appearance, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorModePreference } from '@/lib/color-mode';

export function useColorMode() {
  const snapshot = useSyncExternalStore(
    colorModePreference.subscribe,
    colorModePreference.getSnapshot,
    colorModePreference.getSnapshot,
  );
  return { ...snapshot, setMode: colorModePreference.setMode };
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const { ready } = useColorMode();
  useEffect(() => {
    const systemMode = () => Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
    void colorModePreference.initialize(AsyncStorage, systemMode());
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      colorModePreference.setSystemMode(colorScheme === 'light' ? 'light' : 'dark');
    });
    return () => subscription.remove();
  }, []);
  if (!ready) return <View style={{ flex: 1, backgroundColor: '#0a0a0c', alignItems: 'center', justifyContent: 'center' }}>
    <ActivityIndicator color="#ffb000" />
  </View>;
  return children;
}
