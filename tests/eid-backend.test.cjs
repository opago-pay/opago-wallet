'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

process.env.EID_DEMO_MODE = 'true';
process.env.EID_DEMO_SECRET = 'integration-test-secret-123456';
process.env.EID_BIND_HOST = '127.0.0.1';
process.env.EID_SESSION_RATE_LIMIT_PER_MINUTE = '1';
delete process.env.EID_ED25519_PRIVATE_KEY_PEM;

const { server } = require('../server/eid-backend.js');

async function json(response) {
  const body = await response.json();
  return { response, body };
}

test('eID sessions require authorization, emit a valid proof, and reject replay', async t => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = 'http://127.0.0.1:' + address.port;

  const keyResult = await json(await fetch(baseUrl + '/api/keys/public'));
  assert.equal(keyResult.response.status, 200);
  assert.equal(keyResult.body.algorithm, 'ed25519');

  const sessionResult = await json(await fetch(baseUrl + '/api/eid/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletIdentifier: 'wallet-integration-test',
      transactionReference: 'lnurl:https://merchant.example',
    }),
  }));
  assert.equal(sessionResult.response.status, 201);
  assert.equal(sessionResult.body.demo, true);
  const rateLimited = await fetch(baseUrl + '/api/eid/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      walletIdentifier: 'second-wallet-integration-test',
      transactionReference: 'lnurl:https://merchant.example',
    }),
  });
  assert.equal(rateLimited.status, 429);


  const sessionUrl = baseUrl + '/api/eid/session/' + sessionResult.body.sessionId;
  const pending = await json(await fetch(sessionUrl + '/status'));
  assert.equal(pending.body.status, 'PENDING');

  const unauthorized = await fetch(sessionUrl + '/demo-complete', {
    method: 'POST',
    headers: { Authorization: 'Bearer wrong-secret' },
  });
  assert.equal(unauthorized.status, 401);

  const completed = await json(await fetch(sessionUrl + '/demo-complete', {
    method: 'POST',
    headers: { Authorization: 'Bearer integration-test-secret-123456' },
  }));
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.status, 'SUCCESS');

  const success = await json(await fetch(sessionUrl + '/status'));
  assert.equal(success.body.status, 'SUCCESS');
  const payerData = success.body.payerData;
  assert.equal(payerData.transactionReference, 'lnurl:https://merchant.example');
  assert.equal(payerData.compliance.algorithm, 'ed25519');
  assert.ok(payerData.expiresAt > Date.now());
  assert.ok(payerData.expiresAt - payerData.issuedAt <= 60_000);

  const canonicalPayload = {
    name: payerData.name,
    identifier: payerData.identifier,
    walletIdentifier: payerData.walletIdentifier,
    kycStatus: payerData.kycStatus,
    provider: payerData.provider,
    transactionReference: payerData.transactionReference,
    sessionNonce: payerData.sessionNonce,
    issuedAt: payerData.issuedAt,
    expiresAt: payerData.expiresAt,
  };
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(keyResult.body.publicKey, 'hex'),
    format: 'der',
    type: 'spki',
  });
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(JSON.stringify(canonicalPayload)),
      publicKey,
      Buffer.from(payerData.compliance.signature, 'hex'),
    ),
    true,
  );

  const replay = await fetch(sessionUrl + '/demo-complete', {
    method: 'POST',
    headers: { Authorization: 'Bearer integration-test-secret-123456' },
  });
  assert.equal(replay.status, 409);
});
