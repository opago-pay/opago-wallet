import { t } from './i18n';
import * as LocalAuthentication from 'expo-local-authentication';
import { AppState, Platform } from 'react-native';
import { walletSession } from './wallet-session';
import { categorizeAuthFailure, recordAuthDiagnostic } from './auth-diagnostics';

let authenticating = false;

async function waitForForeground(): Promise<void> {
  if (AppState.currentState === 'active') return;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let subscription: ReturnType<typeof AppState.addEventListener> | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      if (error) reject(error);
      else resolve();
    };
    // Face ID can resolve before iOS finishes dismissing its system overlay.
    // Do not use the result until the app is actually active again.
    const timer = setTimeout(() => finish(new Error('Return to Opago and try again.')),
      Platform.OS === 'ios' ? 15_000 : 2_000);
    subscription = AppState.addEventListener('change', state => {
      if (state === 'active') finish();
    });
    // The active event may have arrived between the first check and subscribing.
    if (AppState.currentState === 'active') finish();
  });
}

async function runDeviceAuthentication(
  promptMessage: string,
  options: { allowDeviceCredential?: boolean },
  onPrompt?: (allowsCredentialActivity: boolean) => void,
): Promise<void> {
  recordAuthDiagnostic('device_auth.begin');
  if (Platform.OS === 'web') throw new Error('Use the Opago mobile app to unlock your wallet.');
  if (authenticating) throw new Error('Device authentication is already in progress.');
  if (AppState.currentState !== 'active') {
    recordAuthDiagnostic('device_auth.failed', 'background');
    throw new Error('Return to Opago and try again.');
  }
  authenticating = true;
  let interrupted = false;
  let promptStarted = false;
  // Android 10 and older cannot combine BIOMETRIC_STRONG with DEVICE_CREDENTIAL.
  const allowDeviceCredential = Boolean(options.allowDeviceCredential && (Platform.OS !== 'android' || Number(Platform.Version) >= 30));
  const subscription = AppState.addEventListener('change', state => {
    if (state === 'active' || state === 'inactive' || state === 'background') recordAuthDiagnostic(`app.${state}`);
    // iOS can report a brief background transition for its own Face ID UI.
    // Only a successful native result followed by a foreground return may pass.
    if (state !== 'background') return;
    if (promptStarted && (Platform.OS === 'ios' || (allowDeviceCredential && Platform.OS === 'android'))) return;
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
    onPrompt?.(Platform.OS === 'ios' || (allowDeviceCredential && Platform.OS === 'android'));
    promptStarted = true;
    recordAuthDiagnostic('device_auth.prompt');
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t(promptMessage),
      promptSubtitle: t('Authorize access to your Opago wallet'),
      cancelLabel: t('Cancel'),
      disableDeviceFallback: !allowDeviceCredential,
      biometricsSecurityLevel: 'strong',
    });
    if (interrupted || !result.success) {
      recordAuthDiagnostic('device_auth.rejected', interrupted ? 'background' : 'cancelled');
      throw new Error('Device authentication cancelled or unsuccessful. Try again to continue.');
    }
    recordAuthDiagnostic('device_auth.approved');
    recordAuthDiagnostic('device_auth.wait_foreground');
    await waitForForeground();
    if (interrupted) throw new Error('Authentication cancelled when you left Opago.');
    recordAuthDiagnostic('device_auth.foreground');
  } catch (cause) {
    recordAuthDiagnostic('device_auth.failed', categorizeAuthFailure(cause));
    throw cause;
  } finally {
    subscription.remove();
    authenticating = false;
  }
}

// Unlocking a locked wallet does not preserve an existing wallet session.
export async function authenticateDevice(promptMessage: string, options: { allowDeviceCredential?: boolean } = {}): Promise<void> {
  await runDeviceAuthentication(promptMessage, options);
}

// The protected iOS keychain item performs its own Face ID challenge. During
// wallet unlock there is no unlocked session to preserve yet; accept the key
// only after that native challenge has returned and Opago is foreground.
export async function readProtectedKeyForUnlock<T>(operation: () => Promise<T>): Promise<T> {
  if (AppState.currentState !== 'active') throw new Error('Return to Opago and try again.');
  const value = await operation();
  await waitForForeground();
  return value;
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

// A protected keychain read can itself present Face ID and temporarily hide
// Opago. Preserve only this exact unlocked session until the native read has
// finished and the app is foreground again; a later lock still invalidates it.
export async function withProtectedWalletAccess<T>(operation: () => Promise<T>): Promise<T> {
  const attempt = walletSession.beginDeviceAuthentication(true);
  try {
    const value = await operation();
    await waitForForeground();
    attempt.complete()();
    return value;
  } catch (cause) {
    attempt.cancel();
    throw cause;
  }
}
