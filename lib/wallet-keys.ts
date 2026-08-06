import { mnemonicToSeedSync, validateMnemonic } from 'bip39';
import { Keypair } from '@solana/web3.js';
import { derivePath } from 'ed25519-hd-key';

export const SOLANA_DERIVATION_PATH = "m/44'/501'/0'/0'";

export function deriveSolanaKeypair(mnemonic: string): Keypair {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!validateMnemonic(normalized)) throw new Error('The recovery phrase is not valid BIP39.');

  const seed = mnemonicToSeedSync(normalized);
  const privateKey = derivePath(SOLANA_DERIVATION_PATH, seed.toString('hex')).key;
  if (!(privateKey instanceof Uint8Array) || privateKey.length !== 32) {
    throw new Error('Could not derive a valid Solana private key.');
  }
  return Keypair.fromSeed(privateKey);
}
