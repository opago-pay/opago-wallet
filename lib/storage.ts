import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const MNEMONIC_STORE_KEY = 'opago_wallet_mnemonic';
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
    authenticationPrompt: 'Unlock your Opago recovery phrase',
  };
}

export async function hasStoredMnemonic(): Promise<boolean> {
  assertNativeStorage();
  const flag = await SecureStore.getItemAsync(WALLET_EXISTS_KEY);
  if (flag === 'true') return true;
  return (await SecureStore.getItemAsync(MNEMONIC_STORE_KEY)) !== null;
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

  const protectedValue = await SecureStore.getItemAsync(key, mnemonicOptions());
  if (protectedValue) return protectedValue;

  const legacyValue = await SecureStore.getItemAsync(key);
  if (!legacyValue) return null;

  await setSecureItem(key, legacyValue);
  await SecureStore.deleteItemAsync(key);
  return SecureStore.getItemAsync(key, mnemonicOptions());
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
