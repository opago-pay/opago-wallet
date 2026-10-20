const test = require('node:test');
const assert = require('node:assert/strict');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { verifyKeyDocument, NativeHkaTransport } = require('../lib/opago/hka.ts');
const { HPKE_SIGNING_ROOTS } = require('../lib/opago/hpke-roots.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];

// Public signed response from GET https://api.opago.com/api/v2/auth/hpke-key,
// 19 October 2026. No signing private key or account data is present.
const document = require('./fixtures/hpke-root-1-public-document.json');
const config = { revoked_signing_key_ids: [], revoked_kids: [] };
const trust = { audience: 'https://api.opago.com', platform: 'android', build: 1,
  oidc: { issuer: 'https://api.opago.com', clientId: 'opago-wallet', redirectUri: 'opagowallet://callback' } };
const now = Date.parse('2026-10-19T17:51:13Z');

test('bundled release root verifies the captured production signature without environment roots', () => {
  assert.deepEqual(verifyKeyDocument(document, config, trust, now), document);
  assert.equal(Object.isFrozen(HPKE_SIGNING_ROOTS), true);
  assert.doesNotThrow(() => new NativeHkaTransport(trust, async () => { throw new Error('No network in test'); }, new MemoryPrivateStore(), () => new Uint8Array(32)));
  assert.throws(() => new NativeHkaTransport({ ...trust, audience: 'https://other.example' }, async () => {}, new MemoryPrivateStore(), () => new Uint8Array(32)));
});

test('production root rejects tampering, unknown roots and keys beyond the approved expiry', () => {
  for (const mutate of [
    value => { value.signature = 'A'.repeat(86); },
    value => { value.signing_key_id = 'unknown-root'; },
    value => { value.document.keys[0].public_key = 'A'.repeat(43); },
    value => { value.document.issued_at = '2026-10-19T17:51:14Z'; },
    value => { value.document.keys[0].not_after = '2027-05-01T00:00:00Z'; },
    value => { value.document.audience = 'https://other.example'; },
  ]) {
    const changed = structuredClone(document); mutate(changed);
    assert.throws(() => verifyKeyDocument(changed, config, trust, now));
  }
  assert.throws(() => verifyKeyDocument(document, config, { ...trust, roots: {} }, now));
  assert.throws(() => verifyKeyDocument(document, { ...config, revoked_signing_key_ids: [document.signing_key_id] }, trust, now));
  assert.throws(() => verifyKeyDocument(document, { ...config, revoked_kids: [document.document.active_kid] }, trust, now));
  assert.throws(() => verifyKeyDocument(document, config, trust, Date.parse('2027-04-30T00:00:00Z')));
  assert.throws(() => verifyKeyDocument(document, config, trust, now, { issuedAt: '2026-10-19T17:52:00Z', digest: '' }));
  assert.throws(() => verifyKeyDocument(document, config, { ...trust, audience: 'https://other.example', roots: HPKE_SIGNING_ROOTS }, now));
});
