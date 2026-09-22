import { bech32 } from 'bech32';
import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';

// light-bolt11-decoder checks Bech32, but does not verify signatures.
// BOLT 11 signs the HRP and data words, padded to a byte boundary.
export function assertInvoiceSignature(invoice: string): void {
  try {
    const { prefix, words } = bech32.decode(invoice, 16_384);
    if (words.length < 7 + 104) throw new Error();
    const data = words.slice(0, -104);
    const tags = new Map<number, number[]>();
    for (let offset = 7; offset < data.length;) {
      if (offset + 3 > data.length) throw new Error();
      const code = data[offset];
      const length = data[offset + 1] * 32 + data[offset + 2];
      offset += 3;
      if (offset + length > data.length) throw new Error();
      if ([1, 16, 23, 19].includes(code) && length !== (code === 19 ? 53 : 52)) throw new Error();
      if ([1, 16, 13, 23, 19, 6].includes(code) && tags.has(code)) throw new Error();
      tags.set(code, data.slice(offset, offset + length));
      offset += length;
    }
    if (!tags.has(1) || !tags.has(16) || tags.has(13) === tags.has(23)) throw new Error();
    const paddedWords = data.slice();
    while (paddedWords.length % 8 !== 0) paddedWords.push(0);
    const bytes = Uint8Array.from(bech32.fromWords(paddedWords)).slice(0, Math.ceil(data.length * 5 / 8));
    const digest = sha256(concatBytes(utf8ToBytes(prefix), bytes));
    const signatureBytes = Uint8Array.from(bech32.fromWords(words.slice(-104)));
    const recovery = signatureBytes[64];
    if (recovery > 3) throw new Error();
    const signature = secp256k1.Signature.fromCompact(signatureBytes.slice(0, 64)).addRecoveryBit(recovery);
    const payee = tags.get(19);
    const publicKey = payee
      ? Uint8Array.from(bech32.fromWords(payee))
      : signature.recoverPublicKey(digest).toRawBytes(true);
    if (!secp256k1.verify(signature.toCompactRawBytes(), digest, publicKey, { lowS: !!payee, prehash: false })) throw new Error();
  } catch {
    throw new Error('The Lightning invoice is invalid or has an invalid signature.');
  }
}
