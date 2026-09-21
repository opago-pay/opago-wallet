import 'react-native-get-random-values';
import 'react-native-reanimated';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { WalletProvider } from '@/hooks/useWalletAuth';
import { WalletGate } from '@/components/security/wallet-gate';
import { BackupPrompt } from '@/components/security/backup-prompt';
import { LanguageProvider } from '@/hooks/useLanguage';

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
  return (
    <WalletProvider>
      <ThemeProvider value={DarkTheme}>
        <WalletGate>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="scan" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <BackupPrompt />
        </WalletGate>
        <StatusBar style="light" />
      </ThemeProvider>
    </WalletProvider>
  );
}

export default function RootLayout() {
  return <LanguageProvider><AppStack /></LanguageProvider>;
}
