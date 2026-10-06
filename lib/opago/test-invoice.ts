import { bech32 } from 'bech32';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';

/** Public synthetic key, no Lightning node or route. NEVER use this invoice for Spark payment. */
export function contractTestInvoice(amountSats: number, network: 'mainnet' | 'regtest', hash: string, descriptionHash: string, now: number): string {
  const key = new Uint8Array(32).fill(7);
  const tag = (code: number, bytes: Uint8Array) => { const words = bech32.toWords(bytes); return [code, words.length >> 5, words.length % 32, ...words]; };
  const prefix = 'ln' + (network === 'mainnet' ? 'bc' : 'bcrt') + amountSats * 10 + 'n';
  const timestamp = Math.floor(now / 1000);
  const words = [...Array.from({ length: 7 }, (_, i) => Math.floor(timestamp / 32 ** (6 - i)) % 32),
    ...tag(1, hexToBytes(hash)), ...tag(16, new Uint8Array(32).fill(9)), ...tag(23, hexToBytes(descriptionHash)),
    [6, 0, 3, 3, 16, 16], ...tag(19, secp256k1.getPublicKey(key))].flat();
  const padded = words.slice(); while (padded.length % 8) padded.push(0);
  const digest = sha256(concatBytes(utf8ToBytes(prefix), Uint8Array.from(bech32.fromWords(padded)).slice(0, Math.ceil(words.length * 5 / 8))));
  const signature = secp256k1.sign(digest, key, { prehash: false });
  return bech32.encode(prefix, [...words, ...bech32.toWords(concatBytes(signature.toCompactRawBytes(), Uint8Array.of(signature.recovery)))], 2000);
}
