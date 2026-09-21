import { mnemonicToSeedSync } from 'bip39';
import { PrivateKey, PublicKey } from '@hiero-ledger/sdk';
import { derivePath } from 'ed25519-hd-key';
import { normalizeRecoveryMnemonic } from '../wallet-seed';

export const HEDERA_DERIVATION_PATH = "m/44'/3030'/0'/0'";
export const HEDERA_KEY_DERIVATION_VERSION = 1 as const;
export const HEDERA_KEY_ALGORITHM = 'ED25519' as const;
export const HEDERA_KEY_DERIVATION = Object.freeze({
  version: HEDERA_KEY_DERIVATION_VERSION,
  algorithm: HEDERA_KEY_ALGORITHM,
  path: HEDERA_DERIVATION_PATH,
});

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
  const normalized = normalizeRecoveryMnemonic(mnemonic);
  const seed = mnemonicToSeedSync(normalized);
  try {
    return deriveHederaPrivateKeyFromSeed(seed, version);
  } finally {
    seed.fill(0);
  }
}

/** Same version/path/key algorithm as phrase derivation, without repeating PBKDF2. */
export function deriveHederaPrivateKeyFromSeed(
  seed: Uint8Array,
  version: number = HEDERA_KEY_DERIVATION_VERSION,
): PrivateKey {
  if (version !== HEDERA_KEY_DERIVATION_VERSION) {
    throw new Error('Unsupported Hedera key derivation version: ' + version + '.');
  }
  if (!(seed instanceof Uint8Array) || seed.length !== 64) throw new Error('Invalid BIP39 seed.');
  const privateKeyBytes = derivePath(
    HEDERA_DERIVATION_PATH,
    Buffer.from(seed).toString('hex'),
  ).key;
  if (!(privateKeyBytes instanceof Uint8Array) || privateKeyBytes.length !== 32) {
    throw new Error('Could not derive a valid Hedera Ed25519 private key.');
  }
  // The SDK copies Uint8Array.slice(), whereas Buffer.slice() aliases its input.
  const sdkInput = Uint8Array.from(privateKeyBytes);
  try {
    return PrivateKey.fromBytesED25519(sdkInput);
  } finally {
    sdkInput.fill(0);
    privateKeyBytes.fill(0);
  }
}

export function normalizeHederaPublicKey(publicKey: string | PublicKey): string {
  const normalized = parsePublicKey(publicKey).toStringRaw().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error('Hedera public key must be an Ed25519 key.');
  }
  return normalized;
}

// Use the SDK's key-alias encoding, never a raw key or an EVM address.
// Aliases do not encode a network; the receive screen must display the build network.
export function buildHederaActivationAlias(publicKey: string | PublicKey): string {
  const normalized = normalizeHederaPublicKey(publicKey);
  return PublicKey.fromStringED25519(normalized).toAccountId(0, 0).toString();
}
