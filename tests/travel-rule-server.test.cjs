'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const test = require('node:test');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise(resolve => server.close(resolve));
}

test('Travel Rule merchant verifies canonical proofs and rejects replay', async t => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const keyServer = http.createServer((req, res) => {
    if (req.url !== '/api/keys/public') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ algorithm: 'ed25519', publicKey: publicKeyHex }));
  });
  await listen(keyServer);
  t.after(() => close(keyServer));

  const keyAddress = keyServer.address();
  assert.equal(typeof keyAddress, 'object');
  process.env.EIDAS_BACKEND_URL = 'http://127.0.0.1:' + keyAddress.port;
  process.env.EIDAS_DEMO_INVOICE = 'lnbcrt1configured-demo-invoice';
  process.env.EIDAS_DEMO_AMOUNT_MSAT = '1000';

  const { server } = require('../scratch_eidas_server.js');
  await listen(server);
  t.after(() => close(server));
  const merchantAddress = server.address();
  assert.equal(typeof merchantAddress, 'object');

  const payload = {
    name: 'DEMO IDENTITY',
    identifier: 'demo-subject-123',
    walletIdentifier: 'wallet-integration-test',
    kycStatus: 'verified',
    provider: 'integration-test-provider',
    transactionReference: 'lnurl:https://merchant.example',
    sessionNonce: crypto.randomBytes(24).toString('hex'),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  const payerData = {
    ...payload,
    compliance: {
      mandatory: true,
      algorithm: 'ed25519',
      signature: crypto.sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString('hex'),
    },
  };

  const callback = new URL(
    'http://127.0.0.1:' + merchantAddress.port + '/lnurl-eidas/callback',
  );
  callback.searchParams.set('amount', '1000');
  callback.searchParams.set('payerdata', JSON.stringify(payerData));

  const accepted = await fetch(callback);
  assert.equal(accepted.status, 200);
  assert.deepEqual(await accepted.json(), { pr: 'lnbcrt1configured-demo-invoice' });

  const replay = await fetch(callback);
  assert.equal(replay.status, 400);
  assert.match((await replay.json()).reason, /already used/i);

  const tampered = {
    ...payerData,
    transactionReference: 'lnurl:https://attacker.example',
  };
  const tamperedUrl = new URL(callback);
  tamperedUrl.searchParams.set('payerdata', JSON.stringify(tampered));
  const rejected = await fetch(tamperedUrl);
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).reason, /invalid eIDAS signature/i);
});
