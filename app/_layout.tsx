import 'react-native-get-random-values';
import 'react-native-reanimated';
import { View, Text } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { PrivyProvider } from '@privy-io/expo';
import { WalletProvider } from '@/hooks/useWalletAuth';

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
        <Stack>
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </WalletProvider>
  );
}

export default function RootLayout() {
  const appId = process.env.EXPO_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId || !clientId) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0a0a0c',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center' }}>
          Wallet configuration is incomplete. Set EXPO_PUBLIC_PRIVY_APP_ID and
          EXPO_PUBLIC_PRIVY_CLIENT_ID.
        </Text>
      </View>
    );
  }

  return (
    <PrivyProvider appId={appId} clientId={clientId}>
      <AppStack />
    </PrivyProvider>
  );
}
