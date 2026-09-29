import { mnemonicToSeed, validateMnemonic } from 'bip39';

/** Preserve the existing English BIP39 phrase and empty passphrase policy. */
export function normalizeRecoveryMnemonic(mnemonic: string): string {
  const normalized = mnemonic.normalize('NFKD').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized)) throw new Error('The recovery phrase is not valid BIP39.');
  return normalized;
}

export type SeedDeriver = (mnemonic: string) => Promise<Uint8Array>;

/** The caller owns these bytes and must erase them when startup ends or locks. */
export async function deriveWalletSeed(
  mnemonic: string,
  derive: SeedDeriver = mnemonicToSeed,
): Promise<Uint8Array> {
  const seed = await derive(normalizeRecoveryMnemonic(mnemonic));
  if (!(seed instanceof Uint8Array) || seed.length !== 64) {
    if (seed instanceof Uint8Array) seed.fill(0);
    throw new Error('Could not derive a valid wallet seed.');
  }
  return seed;
}
