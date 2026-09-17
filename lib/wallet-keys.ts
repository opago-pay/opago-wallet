import {
  deriveHederaPrivateKey,
  HEDERA_DERIVATION_PATH,
  HEDERA_KEY_ALGORITHM,
  HEDERA_KEY_DERIVATION,
  HEDERA_KEY_DERIVATION_VERSION,
} from './hedera/keys';

export {
  deriveHederaPrivateKey,
  HEDERA_DERIVATION_PATH,
  HEDERA_KEY_ALGORITHM,
  HEDERA_KEY_DERIVATION,
  HEDERA_KEY_DERIVATION_VERSION,
};

export function recoveryPhraseMatchesHederaPublicKey(
  mnemonic: string,
  expectedPublicKey: string,
): boolean {
  const normalizedExpected = expectedPublicKey.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalizedExpected)) return false;

  try {
    return (
      deriveHederaPrivateKey(mnemonic).publicKey.toStringRaw().toLowerCase() ===
      normalizedExpected
    );
  } catch {
    return false;
  }
}
