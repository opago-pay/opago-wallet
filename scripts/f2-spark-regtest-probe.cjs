'use strict';
const { randomBytes, createHash } = require('node:crypto');
const { DefaultSparkSigner, SparkWallet } = require('@buildonspark/spark-sdk');
const { decode } = require('light-bolt11-decoder');

(async () => {
  const receiverSeed = randomBytes(64);
  const helperSeed = randomBytes(64);
  const receiver = new DefaultSparkSigner();
  await receiver.createSparkWalletFromSeed(receiverSeed, 0);
  const receiverIdentityPubkey = Buffer.from(await receiver.getIdentityPublicKey()).toString('hex');
  receiverSeed.fill(0);
  let wallet;
  try {
    const initialized = await SparkWallet.initialize({ mnemonicOrSeed: helperSeed, accountNumber: 0, options: { network: 'REGTEST' } });
    wallet = initialized.wallet;
    helperSeed.fill(0);
    const metadata = '[["text/plain","F2 isolated regtest probe"]]';
    const descriptionHash = createHash('sha256').update(metadata).digest('hex');
    const result = await wallet.createLightningInvoice({ amountSats: 20, receiverIdentityPubkey, descriptionHash, expirySeconds: 600 });
    const pr = typeof result.invoice === 'string' ? result.invoice : result.invoice.encodedInvoice;
    const sections = decode(pr).sections;
    const value = name => sections.find(section => section.name === name)?.value;
    if (!pr.startsWith('lnbcrt') || value('amount') !== '20000' || value('description_hash') !== descriptionHash) {
      throw new Error('Unexpected provider invoice properties');
    }
    process.stdout.write('REGTEST_PROVIDER_INVOICE_CREATED_AND_VALIDATED\n');
  } finally {
    helperSeed.fill(0);
    await wallet?.cleanupConnections().catch(() => undefined);
  }
})().catch(error => {
  process.stderr.write(`REGTEST_PROBE_FAILED: ${error?.name || 'Error'}: ${error?.message || 'Unknown'}\n`);
  process.exitCode = 1;
});
setTimeout(() => { process.stderr.write('REGTEST_PROBE_TIMEOUT\n'); process.exit(124); }, 30_000).unref();
