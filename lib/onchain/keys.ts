import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { OnchainNetwork } from './types';

export const ONCHAIN_DERIVATION_VERSION = 1;
export function deriveOnchainAccount(seed: Uint8Array, network: OnchainNetwork) {
  if (seed.length !== 64) throw new Error('Invalid wallet seed.');
  const root = HDKey.fromMasterSeed(seed, network === 'mainnet' ? undefined : { private: 0x04358394, public: 0x043587cf });
  let account: HDKey | undefined;
  try {
    const coin = network === 'mainnet' ? 0 : 1;
    const path = `m/84'/${coin}'/0'`;
    account = root.derive(path);
    const fingerprint = root.fingerprint.toString(16).padStart(8, '0');
    const key = `[${fingerprint}/84'/${coin}'/0']${account.publicExtendedKey}`;
    const external = `wpkh(${key}/0/*)`;
    const internal = `wpkh(${key}/1/*)`;
    const identity = bytesToHex(sha256(new TextEncoder().encode(`v1:${network}:${external}:${internal}`)));
    return {
      scope: `bitcoin_onchain:${network}:${identity}`,
      external,
      internal,
      // Consumed by the in-memory native signer, never saved to a database.
      signingExternal: `wpkh([${fingerprint}/84'/${coin}'/0']${account.privateExtendedKey}/0/*)`,
      signingInternal: `wpkh([${fingerprint}/84'/${coin}'/0']${account.privateExtendedKey}/1/*)`,
    };
  } finally {
    account?.wipePrivateData();
    root.wipePrivateData();
  }
}
