'use strict';

// One-off F2 settlement probe. The receiving public key is supplied by the
// device; the unrelated helper wallet is ephemeral and never receives funds.
const { randomBytes, createHash } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { DefaultSparkSigner, SparkWallet } = require('@buildonspark/spark-sdk');
const { decode } = require('light-bolt11-decoder');
const QRCode = require('qrcode');

const receiverIdentityPubkey = process.argv[2];
const outputPrefix = process.argv[3];
if (!/^(02|03)[0-9a-f]{64}$/i.test(receiverIdentityPubkey || '') || !outputPrefix) {
  throw new Error('Usage: node scripts/f2-spark-mainnet-device-probe.cjs <compressed-receiver-public-key> <output-prefix>');
}

(async () => {
  const helperSeed = randomBytes(64);
  let wallet;
  try {
    const signer = new DefaultSparkSigner();
    await signer.createSparkWalletFromSeed(helperSeed, 0);
    const helperPubkey = Buffer.from(await signer.getIdentityPublicKey()).toString('hex');
    if (helperPubkey === receiverIdentityPubkey.toLowerCase()) throw new Error('Helper and receiver identity keys match');

    const initialized = await SparkWallet.initialize({
      mnemonicOrSeed: helperSeed,
      accountNumber: 0,
      options: { network: 'MAINNET' },
    });
    wallet = initialized.wallet;
    helperSeed.fill(0);

    const metadata = '[["text/plain","Opago F2 20 sat settlement probe"]]';
    const descriptionHash = createHash('sha256').update(metadata).digest('hex');
    const result = await wallet.createLightningInvoice({
      amountSats: 20,
      receiverIdentityPubkey,
      descriptionHash,
      expirySeconds: 600,
    });
    const invoice = typeof result.invoice === 'string' ? result.invoice : result.invoice?.encodedInvoice;
    if (typeof invoice !== 'string') throw new Error('Provider returned no encoded invoice');
    const sections = decode(invoice).sections;
    const value = name => sections.find(section => section.name === name)?.value;
    if (!invoice.toLowerCase().startsWith('lnbc') || value('amount') !== '20000' || value('description_hash') !== descriptionHash) {
      throw new Error('Unexpected provider invoice network, amount or description hash');
    }

    const evidence = {
      createdAt: new Date().toISOString(),
      receiverIdentityPubkey: receiverIdentityPubkey.toLowerCase(),
      helperIdentityPubkey: helperPubkey,
      amountSats: 20,
      metadata,
      descriptionHash,
      paymentHash: value('payment_hash'),
      invoice,
      requestId: result.id,
    };
    writeFileSync(`${outputPrefix}.json`, JSON.stringify(evidence, null, 2), { mode: 0o600 });
    await QRCode.toFile(`${outputPrefix}.png`, invoice.toUpperCase(), { errorCorrectionLevel: 'M', margin: 4, width: 640 });
    process.stdout.write(`MAINNET_PROVIDER_INVOICE_READY ${evidence.createdAt} ${evidence.paymentHash || ''}\n`);
  } finally {
    helperSeed.fill(0);
    await wallet?.cleanupConnections().catch(() => undefined);
  }
})().catch(error => {
  process.stderr.write(`MAINNET_PROBE_FAILED: ${error?.name || 'Error'}: ${error?.message || 'Unknown'}\n`);
  process.exitCode = 1;
});
setTimeout(() => { process.stderr.write('MAINNET_PROBE_TIMEOUT\n'); process.exit(124); }, 45_000).unref();
