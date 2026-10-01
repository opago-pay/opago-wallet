import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { WalletProvider } from '@/hooks/useWalletAuth';
import { WalletGate } from '@/components/security/wallet-gate';
import { BackupPrompt } from '@/components/security/backup-prompt';
import { LanguageProvider } from '@/hooks/useLanguage';
import { ColorModeProvider, useColorMode } from '@/hooks/useColorMode';
import { SecurityPreferencesProvider } from '@/hooks/useSecurityPreferences';
import { startEventLoopMonitor } from '@/lib/performance-trace';
import { recordDiagnosticScreen } from '@/lib/crash-reporting';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const unstable_settings = {
  anchor: '(tabs)',
};

function AppStack() {
  const { mode } = useColorMode();
  const segments = useSegments();
  useEffect(() => { recordDiagnosticScreen(segments); }, [segments]);
  useEffect(() => {
    const stop = startEventLoopMonitor(() => AppState.currentState === 'active');
    return stop;
  }, []);
  return (
    <WalletProvider>
      <ThemeProvider value={mode === 'light' ? DefaultTheme : DarkTheme}>
        <WalletGate>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="send-flow" options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 180 }} />
          <Stack.Screen name="receive-flow" options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 180 }} />
          <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="buy" options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 180 }} />
          <Stack.Screen name="bitcoin-deposits" options={{ headerShown: false }} />
        </Stack>
        <BackupPrompt />
        </WalletGate>
        <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      </ThemeProvider>
    </WalletProvider>
  );
}

export default function RootLayout() {
  return <LanguageProvider><ColorModeProvider><SecurityPreferencesProvider><AppStack /></SecurityPreferencesProvider></ColorModeProvider></LanguageProvider>;
}
