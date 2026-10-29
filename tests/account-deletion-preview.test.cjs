'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { ACCOUNT_DELETION_PREVIEW_ENABLED, deletePreviewAccount, MockAccountDeletionAdapter } = require('../lib/opago/account-deletion-preview.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
test('account deletion preview is disabled by default', () => assert.equal(ACCOUNT_DELETION_PREVIEW_ENABLED, false));
test('successful account deletion clears only account-scoped preview data and keeps seed', async () => {
 const store = new MemoryPrivateStore();
 await store.write('account-deletion-preview.session.a', { token: 'secret' });
 await store.write('account-deletion-preview.profile.a', { name: 'A' });
 await store.write('wallet.seed', 'precious-wallet-seed');
 await store.write('account-deletion-preview.session.b', { token: 'other' });
 const result = await deletePreviewAccount(new MockAccountDeletionAdapter(), store, 'a');
 assert.equal(result.status, 'deleted');
 assert.equal(await store.read('account-deletion-preview.session.a'), null);
 assert.equal(await store.read('account-deletion-preview.profile.a'), null);
 assert.equal(await store.read('wallet.seed'), 'precious-wallet-seed');
 assert.deepEqual(await store.read('account-deletion-preview.session.b'), { token: 'other' });
});
test('backend failure preserves local data', async () => {
 const store = new MemoryPrivateStore();
 await store.write('account-deletion-preview.session.a', 'keep');
 await assert.rejects(deletePreviewAccount({ deleteAccount: async () => { throw new Error('offline'); } }, store, 'a'));
 assert.equal(await store.read('account-deletion-preview.session.a'), 'keep');
});
test('unauthenticated deletion is rejected', async () => {
 await assert.rejects(deletePreviewAccount(new MockAccountDeletionAdapter(), new MemoryPrivateStore(), ''), /Authentication required/);
});
