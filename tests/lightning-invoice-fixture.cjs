'use strict';
const { bech32 } = require('bech32');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { createHash } = require('node:crypto');

// Public synthetic signing key; there is no node, wallet, route or payable invoice.
const fixtureKey = Uint8Array.from({ length: 32 }, () => 7);
const tag = (code, bytes) => {
  const words = bech32.toWords(bytes);
  return [code, words.length >> 5, words.length % 32, ...words];
};
function invoice(amountSats, timestamp = Math.floor(Date.now() / 1000), options = {}) {
  const prefix = 'ln' + (options.network || 'bcrt') + (amountSats === null ? '' : amountSats * 10 + 'n');
  const words = [
    ...Array.from({ length: 7 }, (_, i) => Math.floor(timestamp / 32 ** (6 - i)) % 32),
    ...tag(1, Buffer.from(options.paymentHash || '07'.repeat(32), 'hex')),
    ...tag(16, Buffer.alloc(32, 9)),
    ...(options.descriptionHash ? tag(23, Buffer.from(options.descriptionHash, 'hex')) : tag(13, Buffer.from('Synthetic payment'))),
    ...(options.expiry === false ? [] : [6, 0, 3, 3, 16, 16]),
    ...tag(19, secp256k1.getPublicKey(fixtureKey)),
  ];
  const padded = words.slice();
  while (padded.length % 8) padded.push(0);
  const data = Buffer.from(bech32.fromWords(padded)).subarray(0, Math.ceil(words.length * 5 / 8));
  const hash = createHash('sha256').update(prefix).update(data).digest();
  const signature = secp256k1.sign(hash, fixtureKey, { prehash: false });
  const bytes = Buffer.concat([Buffer.from(signature.toCompactRawBytes()), Buffer.from([signature.recovery])]);
  return bech32.encode(prefix, [...words, ...bech32.toWords(bytes)], 2000);
}
module.exports = { invoice };
