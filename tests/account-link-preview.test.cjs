'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { MockAccountLinkAdapter, LinkPreviewError, linkWithSparkProof, ACCOUNT_LINK_PREVIEW_ENABLED } = require('../lib/opago/account-link-preview.ts');
test('link preview is disabled by default', () => assert.equal(ACCOUNT_LINK_PREVIEW_ENABLED, false));
test('one wallet may only be linked to one account; unlink allows relinking', async () => {
 const mock = new MockAccountLinkAdapter('wallet-a');
 const signer = { sign: async () => 'test-proof' };
 assert.equal((await linkWithSparkProof(mock, signer, 'a', 'wallet-a')).linked, true);
 await assert.rejects(linkWithSparkProof(mock, signer, 'b', 'wallet-a'), e => e instanceof LinkPreviewError && e.code === 'conflict');
 await mock.unlink('a');
 assert.equal((await linkWithSparkProof(mock, signer, 'b', 'wallet-a')).linked, true);
});
test('challenge expiry is enforced at verification', async () => {
 let now = 1000;
 const mock = new MockAccountLinkAdapter('wallet-a', () => now);
 const challenge = await mock.challenge('a', 'wallet-a');
 now += 60000;
 await assert.rejects(mock.verify(challenge, 'test-proof'), e => e.code === 'challenge_expired');
});
test('empty signature never links wallet', async () => {
 const mock = new MockAccountLinkAdapter('wallet-a');
 await assert.rejects(linkWithSparkProof(mock, { sign: async () => '' }, 'a', 'wallet-a'), e => e.code === 'cancelled');
 assert.equal((await mock.status('a')).linked, false);
});
