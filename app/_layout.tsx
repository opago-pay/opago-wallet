import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TransactionSyncAgent } from '../components/opago/transaction-sync-agent';
import * as Notifications from 'expo-notifications';
import { WalletProvider } from '@/hooks/useWalletAuth';
import { WalletGate } from '@/components/security/wallet-gate';
import { BackupPrompt } from '@/components/security/backup-prompt';
import { LanguageProvider } from '@/hooks/useLanguage';
import { ColorModeProvider, useColorMode } from '@/hooks/useColorMode';
import { SecurityPreferencesProvider } from '@/hooks/useSecurityPreferences';
import { startEventLoopMonitor } from '@/lib/performance-trace';
import { recordDiagnosticScreen } from '@/lib/crash-reporting';
import { diagnosticsConsent } from '@/lib/diagnostics-consent';

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
  useEffect(() => { void diagnosticsConsent.initialize(); }, []);
  useEffect(() => {
    // Remove private media copies left by an interrupted previous process.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    void (require('../lib/opago/identity-media-native') as typeof import('../lib/opago/identity-media-native')).cleanupIdentityPhotos().catch(() => {});
  }, []);
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
          <Stack.Screen name="bitcoin-deposits" options={{ headerShown: false }} />
          <Stack.Screen name="opago-account" options={{ headerShown: false }} />
          <Stack.Screen name="opago-signup" options={{ headerShown: false }} />
          <Stack.Screen name="identity" options={{ headerShown: false }} />
          <Stack.Screen name="pos-link" options={{ headerShown: false }} />
          <Stack.Screen name="transaction-sync" options={{ headerShown: false }} />
          <Stack.Screen name="uma-send" options={{ headerShown: false }} />
        </Stack>
        <BackupPrompt />
        <TransactionSyncAgent />
        </WalletGate>
        <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      </ThemeProvider>
    </WalletProvider>
  );
}

export default function RootLayout() {
  return <LanguageProvider><ColorModeProvider><SecurityPreferencesProvider><AppStack /></SecurityPreferencesProvider></ColorModeProvider></LanguageProvider>;
}
