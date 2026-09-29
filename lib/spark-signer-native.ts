import { DefaultSparkSigner, getRandomSigningNonce } from '@buildonspark/spark-sdk';
import { NativeModules, Platform } from 'react-native';
import { PaymentScopedSparkSigner } from './spark-signer-cache';

type PublicKeyBridge = {
  getPublicKey(params: { privateKey: number[]; compressed: true }): Promise<unknown>;
  batchGetPublicKeys(params: { privateKeys: number[][]; compressed: true }): Promise<unknown>;
};

function publicKeyBytes(value: unknown): Uint8Array {
  if (!Array.isArray(value) || value.length !== 33 ||
      (value[0] !== 2 && value[0] !== 3) ||
      value.some(byte => !Number.isInteger(byte) || byte < -128 || byte > 255)) {
    throw new Error('Invalid native Spark public key.');
  }
  // Kotlin Byte.toInt() returns -128..127. Uint8Array restores the exact
  // unsigned bytes, as Spark's own React Native bindings do.
  return Uint8Array.from(value);
}

/**
 * SDK 0.7.12 exposes these Rust operations on Android, but DefaultSparkSigner
 * still uses JavaScript curve multiplication for keys and nonce commitments.
 * Keep SDK derivation, secure randomness, nonce ownership and FROST signing;
 * only delegate the same compressed secp256k1 public-key operation to Rust.
 */
class AndroidSparkSigner extends PaymentScopedSparkSigner {
  constructor(private readonly bridge: PublicKeyBridge) {
    super();
  }

  /** Public Taproot tweak only; no wallet key or signing authorization involved. */
  async getPublicKeyForPublicScalar(scalar: Uint8Array): Promise<Uint8Array> {
    if (scalar.length !== 32) throw new Error('Invalid public scalar.');
    try {
      return publicKeyBytes(await this.bridge.getPublicKey({ privateKey: Array.from(scalar), compressed: true }));
    } catch {
      throw new Error('Native public-point calculation failed.');
    }
  }

  override async getPublicKeyFromDerivation(
    derivation: Parameters<DefaultSparkSigner['getPublicKeyFromDerivation']>[0],
  ): Promise<Uint8Array> {
    return this.reusePublicKey(derivation, () => this.deriveNativePublicKey(derivation));
  }

  private async deriveNativePublicKey(
    derivation: Parameters<DefaultSparkSigner['getPublicKeyFromDerivation']>[0],
  ): Promise<Uint8Array> {
    const secret = await this.getSigningPrivateKeyFromDerivation(derivation);
    // The SDK may own secret (e.g. its deposit key). Erase only our bridge copy.
    const bridgeSecret = Array.from(secret);
    try {
      return publicKeyBytes(await this.bridge.getPublicKey({
        privateKey: bridgeSecret, compressed: true,
      }));
    } catch {
      // Native errors must never propagate key material into logs or alerts.
      throw new Error('Native Spark public-key calculation failed.');
    } finally {
      bridgeSecret.fill(0);
    }
  }

  override async getRandomSigningCommitment() {
    // A new SDK-generated nonce pair for EVERY call: never cache/reuse nonces.
    const nonce = getRandomSigningNonce();
    const bridgeSecrets = [Array.from(nonce.binding), Array.from(nonce.hiding)];
    try {
      const result = await this.bridge.batchGetPublicKeys({
        privateKeys: bridgeSecrets, compressed: true,
      });
      if (!Array.isArray(result) || result.length !== 2) {
        throw new Error('Invalid native Spark commitment.');
      }
      const commitment = {
        binding: publicKeyBytes(result[0]),
        hiding: publicKeyBytes(result[1]),
      };
      // Use the SDK's own commitment-to-nonce map, including object identity.
      this.commitmentToNonceMap.set(commitment, nonce);
      return { commitment };
    } catch {
      nonce.binding.fill(0);
      nonce.hiding.fill(0);
      throw new Error('Native Spark commitment calculation failed.');
    } finally {
      bridgeSecrets.forEach(secret => secret.fill(0));
    }
  }
}

export function createSparkSigner(): DefaultSparkSigner {
  // Deliberately Android-only. In pinned SDK 0.7.12 the iOS versions of these
  // particular bridge methods print their input parameters. Do not call them.
  if (Platform.OS !== 'android') return new DefaultSparkSigner();
  const bridge = NativeModules.SparkFrostModule as PublicKeyBridge | undefined;
  if (!bridge || typeof bridge.getPublicKey !== 'function' ||
      typeof bridge.batchGetPublicKeys !== 'function') {
    return new DefaultSparkSigner();
  }
  return new AndroidSparkSigner(bridge);
}
