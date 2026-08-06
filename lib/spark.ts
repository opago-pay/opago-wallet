import { appConfig } from './config';

export async function initializeSparkWallet(mnemonic: string) {
  const { SparkWallet } = require('@buildonspark/spark-sdk');

  const { wallet } = await SparkWallet.initialize({
    mnemonicOrSeed: mnemonic,
    options: {
      network: appConfig.sparkNetwork,
    },
  });

  await wallet.getSparkAddress();
  return wallet;
}
