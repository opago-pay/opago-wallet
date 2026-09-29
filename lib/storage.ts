import { t } from './i18n';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { categorizeAuthFailure, recordAuthDiagnostic } from './auth-diagnostics';

export const MNEMONIC_STORE_KEY = 'opago_wallet_mnemonic';
export const WALLET_IDENTITY_KEY = 'opago_wallet_public_identity_v1';
export const WALLET_WIPE_PENDING_KEY = 'opago_wallet_wipe_pending_v1';
const WALLET_EXISTS_KEY = 'opago_wallet_exists';
const KEYCHAIN_SERVICE = 'opago.wallet.mnemonic.v2';

function assertNativeStorage(): void {
  if (Platform.OS === 'web') {
    throw new Error('Wallet key storage is disabled on web because browser storage is not secure.');
  }
}

function mnemonicOptions(): SecureStore.SecureStoreOptions {
  return {
    keychainService: KEYCHAIN_SERVICE,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: SecureStore.canUseBiometricAuthentication(),
    authenticationPrompt: t('Unlock your Opago recovery phrase'),
  };
}

export async function hasStoredMnemonic(): Promise<boolean> {
  assertNativeStorage();
  recordAuthDiagnostic('startup.storage_check.begin');
  try {
    if (await SecureStore.getItemAsync(WALLET_WIPE_PENDING_KEY) === 'true') {
      throw new Error('Wallet removal must finish before continuing.');
    }
    const flag = await SecureStore.getItemAsync(WALLET_EXISTS_KEY);
    if (flag === 'true') {
      recordAuthDiagnostic('startup.storage_check.wallet_found');
      return true;
    }
    if (await SecureStore.getItemAsync(WALLET_IDENTITY_KEY) !== null) {
      recordAuthDiagnostic('startup.storage_check.wallet_found');
      return true;
    }
    // Older installations may have a protected mnemonic but no existence flag.
    // Do not mistake that wallet for a fresh installation.
    if (await SecureStore.getItemAsync(MNEMONIC_STORE_KEY, mnemonicOptions()) !== null) {
      recordAuthDiagnostic('startup.storage_check.wallet_found');
      return true;
    }
    const exists = (await SecureStore.getItemAsync(MNEMONIC_STORE_KEY)) !== null;
    recordAuthDiagnostic(exists ? 'startup.storage_check.wallet_found' : 'startup.storage_check.empty');
    return exists;
  } catch (cause) {
    recordAuthDiagnostic('startup.storage_check.failed', categorizeAuthFailure(cause));
    throw cause;
  }
}

// This read never falls back to a legacy unprotected entry. The caller may use
// the keychain's Face ID check as the authorization to display recovery words.
export async function getBiometricallyProtectedMnemonic(): Promise<string | null> {
  assertNativeStorage();
  if (!SecureStore.canUseBiometricAuthentication()) return null;
  return SecureStore.getItemAsync(MNEMONIC_STORE_KEY, { ...mnemonicOptions(), requireAuthentication: true });
}

/** Called only after a complete recovery phrase was checked against the
 * previously saved wallet identity and device authentication succeeded. */
export async function replaceInaccessibleMnemonic(mnemonic: string): Promise<void> {
  assertNativeStorage();
  await SecureStore.deleteItemAsync(MNEMONIC_STORE_KEY, mnemonicOptions());
  await SecureStore.setItemAsync(WALLET_EXISTS_KEY, 'true');
  await setSecureItem(MNEMONIC_STORE_KEY, mnemonic);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  assertNativeStorage();
  if (key !== MNEMONIC_STORE_KEY) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return;
  }
  await SecureStore.setItemAsync(key, value, mnemonicOptions());
  await SecureStore.setItemAsync(WALLET_EXISTS_KEY, 'true');
}

export async function getSecureItem(key: string): Promise<string | null> {
  assertNativeStorage();
  if (key !== MNEMONIC_STORE_KEY) return SecureStore.getItemAsync(key);
  recordAuthDiagnostic('mnemonic_read.begin');
  try {
    const protectedValue = await SecureStore.getItemAsync(key, mnemonicOptions());
    if (protectedValue) {
      recordAuthDiagnostic('mnemonic_read.protected');
      return protectedValue;
    }

    const legacyValue = await SecureStore.getItemAsync(key);
    if (!legacyValue) {
      recordAuthDiagnostic('mnemonic_read.missing');
      return null;
    }

    await setSecureItem(key, legacyValue);
    await SecureStore.deleteItemAsync(key);
    const migrated = await SecureStore.getItemAsync(key, mnemonicOptions());
    recordAuthDiagnostic(migrated ? 'mnemonic_read.legacy' : 'mnemonic_read.missing');
    return migrated;
  } catch (cause) {
    recordAuthDiagnostic('mnemonic_read.failed', categorizeAuthFailure(cause));
    throw cause;
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  assertNativeStorage();
  if (key === MNEMONIC_STORE_KEY) {
    await Promise.all([
      SecureStore.deleteItemAsync(key, mnemonicOptions()),
      SecureStore.deleteItemAsync(key),
      SecureStore.deleteItemAsync(WALLET_EXISTS_KEY),
    ]);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
