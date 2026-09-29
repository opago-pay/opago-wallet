import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';
import { deriveWalletSeed, type SeedDeriver } from './wallet-seed';

const deriveAndroidSeed: SeedDeriver = async mnemonic => {
  const native = requireNativeModule<{ deriveSeed(phrase: string): Promise<number[]> }>('OpagoWalletCrypto');
  const bytes = await native.deriveSeed(mnemonic);
  try {
    if (!Array.isArray(bytes) || bytes.length !== 64 || bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new Error('Could not derive a valid wallet seed.');
    }
    return Uint8Array.from(bytes);
  } finally {
    if (Array.isArray(bytes)) bytes.fill(0);
  }
};

/** Android uses background system crypto; other platforms retain BIP39's async path. */
export function deriveAuthenticatedWalletSeed(mnemonic: string): Promise<Uint8Array> {
  return deriveWalletSeed(mnemonic, Platform.OS === 'android' ? deriveAndroidSeed : undefined);
}
