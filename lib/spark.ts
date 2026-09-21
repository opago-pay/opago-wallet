import { appConfig } from './config';
import { markSparkWalletSynchronized } from './display-spark-balance';

export async function initializeSparkWallet(seed: Uint8Array) {
  if (!(seed instanceof Uint8Array) || seed.length !== 64) throw new Error('Invalid BIP39 seed.');
  // Keep the optional SDK unloaded until the wallet's authenticated startup.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SparkWallet } = require('@buildonspark/spark-sdk');

  // Own the input for this in-flight SDK operation; the caller may lock and erase
  // its retry seed meanwhile. SessionResource disposes any late wallet result.
  const sdkSeed = new Uint8Array(seed);
  try {
    const { wallet } = await SparkWallet.initialize({
      mnemonicOrSeed: sdkSeed,
      options: { network: appConfig.sparkNetwork },
    });
    try {
      await wallet.getSparkAddress();
      markSparkWalletSynchronized(wallet);
      return wallet;
    } catch (cause) {
      await wallet.cleanupConnections().catch(() => undefined);
      throw cause;
    }
  } finally {
    sdkSeed.fill(0);
  }
}
