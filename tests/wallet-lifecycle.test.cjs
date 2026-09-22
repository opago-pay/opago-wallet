'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const bip39 = require('bip39');
const { hookFixture } = require('./react-hooks-fixture.cjs');
require('./register-typescript.cjs');
const { WalletSession } = require('../lib/wallet-session.ts');
const backup = require('../lib/wallet-backup.ts');
const { SessionResource } = require('../lib/session-resource.ts');
const { normalizeRecoveryMnemonic } = require('../lib/wallet-seed.ts');

// Public BIP39 fixture only; no device keys, remote services or real funds.
const PHRASE = 'abandon '.repeat(11) + 'about';
const MNEMONIC = 'test-mnemonic';
const PUBLIC_KEY = 'synthetic-wallet-public-key';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function walletFixture(t, options = {}) {
  const storage = options.storage || new Map();
  const writes = [], prompts = [];
  const session = new WalletSession();
  const appState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
  const seeds = [];
  let sdkStarts = 0;
  const fixture = hookFixture('hooks/useWalletAuth.ts', () => ({
    'react-native': { AppState: appState },
    bip39,
    'expo-crypto': { getRandomBytes: size => new Uint8Array(size).fill(42) },
    '../lib/wallet-session': { walletSession: session },
    '../lib/storage': {
      MNEMONIC_STORE_KEY: MNEMONIC,
      hasStoredMnemonic: async () => storage.has(MNEMONIC),
      getSecureItem: async key => storage.get(key) ?? null,
      setSecureItem: async (key, value) => {
        await options.beforeWrite?.(key);
        writes.push({ operation: 'set', key });
        storage.set(key, value);
      },
      deleteSecureItem: async key => { writes.push({ operation: 'delete', key }); storage.delete(key); },
    },
    '../lib/wallet-backup': backup,
    '../lib/wallet-seed': { normalizeRecoveryMnemonic },
    '../lib/wallet-seed-native': { deriveAuthenticatedWalletSeed: async phrase => {
      assert.equal(bip39.validateMnemonic(phrase), true);
      await options.beforeDerive?.();
      const seed = new Uint8Array(64).fill(7); seeds.push(seed); return seed;
    } },
    '../lib/wallet-keys': { deriveHederaPrivateKeyFromSeed: () => ({ publicKey: { toStringRaw: () => PUBLIC_KEY } }) },
    '../lib/device-authentication': {
      authenticateDevice: async () => { prompts.push('unlock'); await options.authenticate?.(); },
      authorizeWalletAction: async () => { prompts.push('authorize'); await options.authenticate?.(); return session.capture(); },
    },
    '../lib/spark': { initializeSparkWallet: async () => {
      sdkStarts++; return { cleanupConnections: async () => {} };
    } },
    '../lib/session-resource': { SessionResource },
    '../lib/retry': { retryWithBackoff: fn => fn() },
    '../lib/ui-ready': { yieldToUi: async () => {} },
    '../lib/startup-timing': { beginWalletStartupTiming() {}, recordWalletStartupStage() {} },
  }), exported => {
    const provider = exported.WalletProvider({ children: null });
    return provider.type(provider.props).props.value;
  });
  t.after(() => fixture.unmount());
  fixture.render();
  return { ...fixture, storage, writes, prompts, session, seeds, sdkStarts: () => sdkStarts };
}

test('a stored wallet requires unlock and cannot be replaced by create or restore', async t => {
  const fixture = walletFixture(t, { storage: new Map([[MNEMONIC, PHRASE]]) });
  assert.equal((await fixture.settle()).isLocked, true);
  await fixture.render().unlockWallet();
  await fixture.settle();
  await assert.rejects(fixture.render().createWallet(), /already exists/);
  await assert.rejects(fixture.render().restoreWallet(PHRASE), /Remove the current wallet/);
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.prompts, ['unlock']);
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
});

test('missing or inaccessible keys never silently create a replacement wallet', async t => {
  const fixture = walletFixture(t);
  await fixture.settle();
  await assert.rejects(fixture.render().loadOrGenerateWallet(), /new wallet will not be created/);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.sdkStarts(), 0);
  assert.equal(fixture.render().walletReady, false);
});

test('invalid recovery words are rejected before authentication or any storage mutation', async t => {
  const fixture = walletFixture(t);
  await fixture.settle();
  await assert.rejects(fixture.render().restoreWallet('abandon '.repeat(12)), /valid BIP39/);
  assert.deepEqual(fixture.prompts, []);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.sdkStarts(), 0);
});

test('cancelled device authorization cannot create or restore wallet keys', async t => {
  const fixture = walletFixture(t, { authenticate: async () => { throw new Error('Authentication cancelled.'); } });
  await fixture.settle();
  await assert.rejects(fixture.render().createWallet(), /cancelled/);
  await assert.rejects(fixture.render().restoreWallet(PHRASE), /cancelled/);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.sdkStarts(), 0);
  assert.equal(fixture.render().walletReady, false);
});

test('restoration normalizes words and verified backup status survives a fresh provider instance', async t => {
  const fixture = walletFixture(t);
  await fixture.settle();
  await fixture.render().restoreWallet('  ' + PHRASE.toUpperCase().replaceAll(' ', '\n  ') + '  ');
  await fixture.settle();
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
  assert.equal(fixture.render().backupStatus, 'required');
  await fixture.render().markBackupVerified();
  await fixture.settle();
  assert.equal(fixture.render().backupStatus, 'verified');
  assert.ok(fixture.seeds.every(seed => seed.every(byte => byte === 0)));
  const restarted = walletFixture(t, { storage: fixture.storage });
  await restarted.settle();
  assert.equal(restarted.render().backupStatus, 'loading');
  await restarted.render().unlockWallet();
  await restarted.settle();
  await restarted.render().loadOrGenerateWallet();
  await restarted.settle();
  assert.equal(restarted.render().backupStatus, 'verified');
  assert.equal(restarted.render().hederaPublicKey, PUBLIC_KEY);
  assert.deepEqual(restarted.writes, []);
});

test('failed recovery rolls back the temporary phrase and allows an explicit retry', async t => {
  let fail = true;
  const fixture = walletFixture(t, { beforeDerive: async () => { if (fail) throw new Error('Native crypto unavailable'); } });
  await fixture.settle();
  await assert.rejects(fixture.render().restoreWallet(PHRASE), /Native crypto unavailable/);
  assert.equal(fixture.storage.has(MNEMONIC), false);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(fixture.sdkStarts(), 0);
  fail = false;
  await fixture.render().restoreWallet(PHRASE);
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
});

test('locking during recovery discards late key material and rolls back the unfinished restore', async t => {
  const derivation = deferred();
  const fixture = walletFixture(t, { beforeDerive: () => derivation.promise });
  await fixture.settle();
  const restore = fixture.render().restoreWallet(PHRASE);
  await fixture.settle();
  fixture.session.lock();
  derivation.resolve();
  await assert.rejects(restore, /locked/i);
  await fixture.settle();
  assert.equal(fixture.storage.has(MNEMONIC), false);
  assert.ok(fixture.seeds.every(seed => seed.every(byte => byte === 0)));
  assert.equal(fixture.sdkStarts(), 0);
  assert.equal(fixture.render().isLocked, true);
  assert.equal(fixture.render().walletReady, false);
});

test('failed secure-storage writes cannot publish a successful recovery or backup check', async t => {
  let failKey = MNEMONIC;
  const fixture = walletFixture(t, { beforeWrite: async key => { if (key === failKey) throw new Error('Secure storage unavailable'); } });
  await fixture.settle();
  await assert.rejects(fixture.render().restoreWallet(PHRASE), /Secure storage unavailable/);
  assert.equal(fixture.storage.has(MNEMONIC), false);
  assert.equal(fixture.sdkStarts(), 0);
  failKey = backup.BACKUP_STATUS_KEY;
  await fixture.render().restoreWallet(PHRASE);
  await fixture.settle();
  await assert.rejects(fixture.render().markBackupVerified(), /Secure storage unavailable/);
  assert.equal(fixture.render().backupStatus, 'required');
  assert.equal(fixture.storage.has(backup.BACKUP_STATUS_KEY), false);
});
