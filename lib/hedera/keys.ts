import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { PrivateKey, PublicKey } from '@hiero-ledger/sdk';
import { derivePath } from 'ed25519-hd-key';

export const HEDERA_DERIVATION_PATH = "m/44'/3030'/0'/0'";
export const HEDERA_KEY_DERIVATION_VERSION = 1 as const;
export const HEDERA_KEY_ALGORITHM = 'ED25519' as const;
export const HEDERA_KEY_DERIVATION = Object.freeze({
  version: HEDERA_KEY_DERIVATION_VERSION,
  algorithm: HEDERA_KEY_ALGORITHM,
  path: HEDERA_DERIVATION_PATH,
});

function normalizeMnemonic(mnemonic: string): string {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized)) {
    throw new Error('The recovery phrase is not valid BIP39.');
  }
  return normalized;
}

function parsePublicKey(publicKey: string | PublicKey): PublicKey {
  if (publicKey instanceof PublicKey) return publicKey;
  const normalized = publicKey.trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(normalized)) {
    return PublicKey.fromStringED25519(normalized);
  }
  return PublicKey.fromString(normalized);
}

export function deriveHederaPrivateKey(
  mnemonic: string,
  version: number = HEDERA_KEY_DERIVATION_VERSION,
): PrivateKey {
  if (version !== HEDERA_KEY_DERIVATION_VERSION) {
    throw new Error('Unsupported Hedera key derivation version: ' + version + '.');
  }
  const normalized = normalizeMnemonic(mnemonic);
  const seed = mnemonicToSeedSync(normalized);
  const privateKeyBytes = derivePath(
    HEDERA_DERIVATION_PATH,
    seed.toString('hex'),
  ).key;
  if (!(privateKeyBytes instanceof Uint8Array) || privateKeyBytes.length !== 32) {
    throw new Error('Could not derive a valid Hedera Ed25519 private key.');
  }
  return PrivateKey.fromBytesED25519(privateKeyBytes);
}

export function normalizeHederaPublicKey(publicKey: string | PublicKey): string {
  const normalized = parsePublicKey(publicKey).toStringRaw().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Hedera public key must be an Ed25519 key.');
  }
  return normalized;
}
