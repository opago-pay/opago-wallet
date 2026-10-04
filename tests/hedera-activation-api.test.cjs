'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { PrivateKey } = require('@hiero-ledger/sdk');
require('./register-typescript.cjs');

const {
  signActivationChallenge,
  validateActivationChallenge,
  requestHederaActivation,
  ActivationApiError,
} = require('../lib/hedera/activation-api.ts');

// Upstream opago-compliance 4e51e217f072d8ff9a33d9aeeaef1e1ab6b27d99.
const fixture = require('./fixtures/hedera-activation/test-vectors-v1.json');
const publicKey = fixture.public_key_chunks.join('');
const expectedSignature = fixture.signature_chunks.join('');
const key = PrivateKey.fromStringED25519(fixture.test_only_private_seed);
const challengeId = fixture.challenge_id;
const expiresAt = fixture.expires_at;

function challenge(expiry = expiresAt) {
  return {
    challenge_id: challengeId,
    expires_at: expiry,
    message: `Opago Hedera activation\nversion:1\nnetwork:testnet\npublic_key:${publicKey}\nnonce:${'22'.repeat(32)}\nexpires_at:${expiry}\nchallenge_id:${challengeId}\n`,
  };
}

test('wallet Ed25519 signature matches backend API v1 test-vectors-v1.json', () => {
  assert.equal(key.publicKey.toStringRaw(), publicKey);
  assert.equal(challenge().message, fixture.message_lines.join('\n'));
  for (const message of [challenge().message.trimEnd(), challenge().message.replaceAll('\n', '\r\n'), challenge().message + '\n']) {
    assert.throws(() => signActivationChallenge({ ...challenge(), message }, key, Date.parse('2030-01-01T00:00:00Z')), /does not match/);
  }
  const vector = validateActivationChallenge(challenge(), publicKey, Date.parse('2030-01-01T00:00:00Z'));
  assert.equal(signActivationChallenge(vector, key, Date.parse('2030-01-01T00:00:00Z')), expectedSignature);
  assert.throws(() => validateActivationChallenge({ ...vector, message: vector.message.replace('network:testnet', 'network:mainnet') }, publicKey, Date.parse('2030-01-01T00:00:00Z')), /does not match/);
  assert.throws(() => validateActivationChallenge(vector, publicKey, Date.parse(expiresAt)), /expired/);
});

test('activation retrieves existing job with a fresh proof and accepts retryable API errors', async () => {
  const originalUrl = process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
  const originalFetch = global.fetch;
  process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL = 'https://hedera-activation-testnet.opago.com';
  const paths = [];
  global.fetch = async (url, options) => {
    const path = new URL(url).pathname;
    paths.push(path);
    if (path === '/v1/challenges') {
      const expiry = new Date(Date.now() + 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      return new Response(JSON.stringify(challenge(expiry)));
    }
    assert.equal(options.method, 'POST');
    assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(), ['challenge_id', 'network', 'public_key', 'signature']);
    return new Response(JSON.stringify({
      job_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'pending',
      transaction_id: null, account_id: null, error_code: null, retry_after: null,
    }));
  };
  try {
    const job = await requestHederaActivation(key, () => undefined, true);
    assert.equal(job.status, 'pending');
    assert.deepEqual(paths, ['/v1/challenges', '/v1/activations/status']);
    global.fetch = async () => new Response(JSON.stringify({ error: {
      code: 'ACTIVATION_QUEUE_FULL', retryable: true, retry_after: null, next_release_at: null,
    } }), { status: 429 });
    await assert.rejects(requestHederaActivation(key, () => undefined, true),
      error => error instanceof ActivationApiError && error.code === 'ACTIVATION_QUEUE_FULL');
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
    else process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL = originalUrl;
  }
});

for (const [http,code] of [[400,'INVALID_REQUEST'],[400,'NETWORK_DISABLED'],[401,'INVALID_SIGNATURE'],[401,'CHALLENGE_EXPIRED'],[401,'CHALLENGE_USED'],[401,'CHALLENGE_NOT_FOUND'],[404,'JOB_NOT_FOUND'],[429,'RATE_LIMITED'],[429,'DAILY_ACTIVATION_LIMIT'],[429,'ACTIVATION_QUEUE_FULL'],[503,'STORAGE_UNAVAILABLE'],[503,'PAYER_UNAVAILABLE'],[503,'PAYER_LOW_BALANCE']]) {
  test('API v1 ' + http + ' ' + code + ' keeps a translated stable error', async () => {
    const previousFetch=global.fetch, previousUrl=process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
    process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL='https://hedera-activation.opago.com';
    global.fetch=async () => new Response(JSON.stringify({error:{code,retryable:http>=429,retry_after:'2030-01-01T00:00:00Z'}}),{status:http});
    try {
      await assert.rejects(requestHederaActivation(key,()=>{},true), error => error instanceof ActivationApiError && error.code===code);
      const message=require('../lib/hedera/activation-errors.ts').ACTIVATION_ERROR_TEXT[code];
      assert.ok(message);
      assert.ok(require('../lib/i18n/locales/de.json')[message], 'German translation for ' + code);
    } finally { global.fetch=previousFetch; if(previousUrl===undefined) delete process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL; else process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL=previousUrl; }
  });
}
test('proxy 429 HTML still respects Retry-After and never exposes HTML to the UI', async () => {
  const previousFetch=global.fetch, previousUrl=process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
  process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL='https://hedera-activation.opago.com';
  global.fetch=async () => new Response('<html>rate limited</html>',{status:429,headers:{'retry-after':'120'}});
  const before=Date.now();
  try {
    await assert.rejects(requestHederaActivation(key,()=>{},true), error => error.code==='RATE_LIMITED' && Date.parse(error.retryAfter)>=before+120000);
  } finally {global.fetch=previousFetch;if(previousUrl===undefined)delete process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;else process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL=previousUrl;}
});
