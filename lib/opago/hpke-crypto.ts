import { CipherSuite } from '@hpke/core';
import { Dhkem, HkdfSha256Native, toArrayBuffer } from '@hpke/common';
import { X25519 } from '@hpke/dhkem-x25519';
import { extract, expand } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { gcm } from '@noble/ciphers/aes';

// Preserve hpke-js's RFC 9180 KEM, labels, key schedule and sequence handling.
// Hermes has no SubtleCrypto: supply library primitives, never emulate cryptography.
class HermesHkdf extends HkdfSha256Native {
  async extract(salt: ArrayBufferLike | ArrayBufferView, ikm: ArrayBufferLike | ArrayBufferView): Promise<ArrayBuffer> {
    return toArrayBuffer(extract(sha256, new Uint8Array(toArrayBuffer(ikm)), new Uint8Array(toArrayBuffer(salt))));
  }
  async expand(prk: ArrayBufferLike | ArrayBufferView, info: ArrayBufferLike | ArrayBufferView, len: number): Promise<ArrayBuffer> {
    return toArrayBuffer(expand(sha256, new Uint8Array(toArrayBuffer(prk)), new Uint8Array(toArrayBuffer(info)), len));
  }
  async extractAndExpand(salt: ArrayBufferLike | ArrayBufferView, ikm: ArrayBufferLike | ArrayBufferView, info: ArrayBufferLike | ArrayBufferView, len: number): Promise<ArrayBuffer> {
    return this.expand(await this.extract(salt, ikm), info, len);
  }
}
class HermesX25519 extends Dhkem {
  readonly secretSize = 32; readonly encSize = 32; readonly publicKeySize = 32; readonly privateKeySize = 32;
  constructor() { const kdf = new HermesHkdf(); super(0x0020, new X25519(kdf), kdf); }
}
class HermesSuite extends CipherSuite {
  // Every selected algorithm uses pure library implementations; _api is unused.
  protected async _setup(): Promise<void> {}
}
export const hpkeSuite = new HermesSuite({ kem: new HermesX25519(), kdf: new HermesHkdf(), aead: {
  id: 0x0002, keySize: 32, nonceSize: 12, tagSize: 16,
  createEncryptionContext(key: ArrayBuffer) {
    const bytes = new Uint8Array(key);
    return {
      async seal(iv: ArrayBuffer, data: ArrayBuffer, aad: ArrayBuffer) { return toArrayBuffer(gcm(bytes, new Uint8Array(iv), new Uint8Array(aad)).encrypt(new Uint8Array(data))); },
      async open(iv: ArrayBuffer, data: ArrayBuffer, aad: ArrayBuffer) { return toArrayBuffer(gcm(bytes, new Uint8Array(iv), new Uint8Array(aad)).decrypt(new Uint8Array(data))); },
    };
  },
} });
export function responseDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array) {
  if (key.length !== 32 || iv.length !== 12 || ciphertext.length < 16) throw new Error('Invalid encrypted response.');
  return gcm(key, iv, aad).decrypt(ciphertext);
}
