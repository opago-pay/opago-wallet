import { t } from './i18n';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, Platform } from 'react-native';
import { walletSession } from './wallet-session';

let authenticating = false;

async function waitForForeground(): Promise<void> {
  if (AppState.currentState === 'active') return;
  await new Promise<void>((resolve, reject) => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      clearTimeout(timer);
      subscription.remove();
      resolve();
    });
    const timer = setTimeout(() => {
      subscription.remove();
      reject(new Error('Return to Opago and try again.'));
    }, 2_000);
  });
}

async function runDeviceAuthentication(
  promptMessage: string,
  options: { allowDeviceCredential?: boolean },
  onPrompt?: (allowsCredentialActivity: boolean) => void,
): Promise<void> {
  if (Platform.OS === 'web') throw new Error('Use the Opago mobile app to unlock your wallet.');
  if (authenticating) throw new Error('Device authentication is already in progress.');
  if (AppState.currentState !== 'active') throw new Error('Return to Opago and try again.');
  authenticating = true;
  let interrupted = false;
  let promptStarted = false;
  // Android 10 and older cannot combine BIOMETRIC_STRONG with DEVICE_CREDENTIAL.
  const allowDeviceCredential = Boolean(options.allowDeviceCredential && (Platform.OS !== 'android' || Number(Platform.Version) >= 30));
  const subscription = AppState.addEventListener('change', state => {
    // Face ID can temporarily make iOS inactive. Leaving the app cancels approval.
    if (state !== 'background') return;
    if (promptStarted && allowDeviceCredential && Platform.OS === 'android') return;
    interrupted = true;
    if (Platform.OS === 'android') void LocalAuthentication.cancelAuthenticate().catch(() => undefined);
  });
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (allowDeviceCredential ? level === LocalAuthentication.SecurityLevel.NONE : level < LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG) {
      if (allowDeviceCredential) throw new Error('Set up a device PIN or biometrics in your device settings to use Opago.');
      if (options.allowDeviceCredential && Platform.OS === 'android') throw new Error('Device PIN authorization requires Android 11 or newer. On this Android version, set up a fingerprint or use a newer device.');
      throw new Error('Set up a fingerprint or strong face recognition in your device settings to use this wallet.');
    }
    if (interrupted || AppState.currentState !== 'active') throw new Error('Authentication cancelled when you left Opago.');
    onPrompt?.(allowDeviceCredential && Platform.OS === 'android');
    promptStarted = true;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t(promptMessage),
      promptSubtitle: t('Authorize access to your Opago wallet'),
      cancelLabel: t('Cancel'),
      disableDeviceFallback: !allowDeviceCredential,
      biometricsSecurityLevel: 'strong',
    });
    if (interrupted || !result.success) {
      throw new Error('Device authentication cancelled or unsuccessful. Try again to continue.');
    }
    await waitForForeground();
    if (interrupted) throw new Error('Authentication cancelled when you left Opago.');
  } finally {
    subscription.remove();
    authenticating = false;
  }
}

// Unlocking a locked wallet does not preserve an existing wallet session.
export async function authenticateDevice(promptMessage: string, options: { allowDeviceCredential?: boolean } = {}): Promise<void> {
  await runDeviceAuthentication(promptMessage, options);
}

// The exception exists only while this exact native prompt is outstanding.
// No key access/submission is authorized in the background or before success.
export async function authorizeWalletAction(promptMessage: string): Promise<() => void> {
  const assertCurrent = walletSession.capture();
  let attempt: ReturnType<typeof walletSession.beginDeviceAuthentication> | undefined;
  try {
    await runDeviceAuthentication(promptMessage, { allowDeviceCredential: Platform.OS === 'android' }, allowsCredentialActivity => {
      assertCurrent();
      attempt = walletSession.beginDeviceAuthentication(allowsCredentialActivity);
    });
    if (!attempt) throw new Error('Device authentication cancelled or unsuccessful. Try again to continue.');
    return attempt.complete();
  } catch (cause) {
    attempt?.cancel();
    throw cause;
  }
}
