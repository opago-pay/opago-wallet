import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { appConfig } from './config';

export async function authorizePayment(): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Payments are disabled in the browser. Use the Opago mobile app.');
  }

  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  if (!hasHardware || !isEnrolled) {
    if (appConfig.isMainnet) {
      throw new Error(
        'Set up strong biometrics on this device before sending real Bitcoin.',
      );
    }
    return;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirm this payment',
    promptSubtitle: 'Unlock Opago to send money',
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
    biometricsSecurityLevel: 'strong',
  });
  if (!result.success) {
    throw new Error(result.error === 'user_cancel' ? 'Payment cancelled.' : 'Identity confirmation failed.');
  }
}
