'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Keypair } = require('@solana/web3.js');

process.env.OCP_DEMO_SOLANA_DESTINATION = Keypair.generate().publicKey.toBase58();
process.env.OCP_DEMO_QUOTE_TTL_MS = '60000';
delete process.env.OCP_DEMO_LIGHTNING_INVOICE;

const { server } = require('../scratch_ocp_server.js');

test('OCP execution is quote-bound, expiring, and single-use', async t => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const address = server.address();
  assert.equal(typeof address, 'object');
  const baseUrl = 'http://127.0.0.1:' + address.port + '/ocp';

  const quoteResponse = await fetch(baseUrl);
  assert.equal(quoteResponse.status, 200);
  const quote = await quoteResponse.json();
  assert.match(quote.quoteId, /^[a-f0-9-]{20,}$/i);
  assert.ok(quote.expiresAt > Date.now());
  assert.deepEqual(
    quote.transferAmounts.map(option => option.asset).sort(),
    ['SOL', 'USDC'],
  );

  const option = quote.transferAmounts.find(item => item.asset === 'USDC');
  const invalid = await fetch(
    baseUrl + '?quoteId=' + encodeURIComponent(quote.quoteId) + '&method=lightning&asset=USDC',
  );
  assert.equal(invalid.status, 400);

  const execution = await fetch(
    baseUrl + '?quoteId=' + encodeURIComponent(quote.quoteId) +
      '&method=' + encodeURIComponent(option.method) +
      '&asset=' + encodeURIComponent(option.asset),
  );
  assert.equal(execution.status, 200);
  const payload = await execution.json();
  assert.equal(payload.quoteId, quote.quoteId);
  assert.equal(payload.type, option.method);
  assert.equal(payload.asset, option.asset);
  assert.equal(payload.amount, option.amount);
  assert.equal(payload.destination, process.env.OCP_DEMO_SOLANA_DESTINATION);

  const replay = await fetch(
    baseUrl + '?quoteId=' + encodeURIComponent(quote.quoteId) +
      '&method=' + encodeURIComponent(option.method) +
      '&asset=' + encodeURIComponent(option.asset),
  );
  assert.equal(replay.status, 409);
});
