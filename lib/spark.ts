import { appConfig } from './config';
import { markSparkWalletSynchronized } from './display-spark-balance';
import { attachSparkSendTiming } from './spark-send-timing';

export async function initializeSparkWallet(seed: Uint8Array, signal?: AbortSignal) {
  if (!(seed instanceof Uint8Array) || seed.length !== 64) throw new Error('Invalid BIP39 seed.');
  if (signal?.aborted) throw new Error('Spark startup was cancelled.');
  // Keep the optional SDK unloaded until the wallet's authenticated startup.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BitcoinSparkWallet } = require('./spark-bitcoin-wallet');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSparkSigner } = require('./spark-signer-native');

  // Own the input for this in-flight SDK operation; the caller may lock and erase
  // its retry seed meanwhile. SessionResource disposes any late wallet result.
  const sdkSeed = new Uint8Array(seed);
  try {
    const { wallet } = await BitcoinSparkWallet.initialize({
      mnemonicOrSeed: sdkSeed,
      signer: createSparkSigner(),
      options: { network: appConfig.sparkNetwork },
    });
    try {
      if (signal?.aborted) throw new Error('Spark startup was cancelled.');
      attachSparkSendTiming(wallet);
      await wallet.getSparkAddress();
      if (signal?.aborted) throw new Error('Spark startup was cancelled.');
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
