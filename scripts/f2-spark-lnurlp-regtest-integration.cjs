'use strict';

const { randomBytes, createHash } = require('node:crypto');
const { DefaultSparkSigner, SparkWallet } = require('@buildonspark/spark-sdk');
const { decode } = require('light-bolt11-decoder');
const { createLnurlpSpikeServer, createSparkInvoiceAdapter } = require('../demo/f2-spark-lnurlp-spike.cjs');

(async () => {
  const receiverSeed = randomBytes(64);
  const helperSeed = randomBytes(64);
  let wallet;
  let server;
  try {
    const receiver = new DefaultSparkSigner();
    await receiver.createSparkWalletFromSeed(receiverSeed, 0);
    const receiverIdentityPubkey = Buffer.from(await receiver.getIdentityPublicKey()).toString('hex');
    receiverSeed.fill(0);

    const initialized = await SparkWallet.initialize({
      mnemonicOrSeed: helperSeed,
      accountNumber: 0,
      options: { network: 'REGTEST' },
    });
    wallet = initialized.wallet;
    helperSeed.fill(0);
    const origin = 'http://127.0.0.1:38453';
    server = createLnurlpSpikeServer({
      alias: 'f2-regtest',
      publicOrigin: origin,
      createInvoice: createSparkInvoiceAdapter(wallet, receiverIdentityPubkey),
      minSats: 20,
      maxSats: 20,
    });
    await new Promise((resolve, reject) => server.listen(38453, '127.0.0.1', resolve).once('error', reject));
    const discovery = await fetch(`${origin}/.well-known/lnurlp/f2-regtest`).then(response => response.json());
    if (discovery.tag !== 'payRequest' || discovery.minSendable !== 20_000 || discovery.maxSendable !== 20_000) {
      throw new Error('Invalid LNURL-P discovery');
    }
    const callback = await fetch(`${discovery.callback}?amount=20000`).then(response => response.json());
    if (typeof callback.pr !== 'string') throw new Error('Provider-backed callback returned no invoice');
    const sections = decode(callback.pr).sections;
    const section = name => sections.find(item => item.name === name)?.value;
    const expectedHash = createHash('sha256').update(discovery.metadata).digest('hex');
    if (!callback.pr.startsWith('lnbcrt') || section('amount') !== '20000' || section('description_hash') !== expectedHash) {
      throw new Error('Provider-backed LNURL-P invoice mismatch');
    }
    process.stdout.write('REGTEST_LNURLP_PROVIDER_CALLBACK_OK\n');
  } finally {
    receiverSeed.fill(0);
    helperSeed.fill(0);
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await wallet?.cleanupConnections().catch(() => undefined);
  }
})().catch(error => {
  process.stderr.write(`REGTEST_LNURLP_INTEGRATION_FAILED: ${error?.name || 'Error'}: ${error?.message || 'Unknown'}\n`);
  process.exitCode = 1;
});
setTimeout(() => { process.stderr.write('REGTEST_LNURLP_INTEGRATION_TIMEOUT\n'); process.exit(124); }, 45_000).unref();
