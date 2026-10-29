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
const IDENTITY = 'test-wallet-identity';
const WIPE_PENDING = 'test-wallet-wipe-pending';
const PUBLIC_KEY = 'synthetic-wallet-public-key';
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function walletFixture(t, options = {}) {
  const storage = options.storage || new Map();
  const writes = [], prompts = [];
  const session = new WalletSession();
  const appStateListeners = new Set();
  const appState = { currentState: options.initialAppState || 'active', addEventListener: (_name, listener) => {
    appStateListeners.add(listener);
    return { remove() { appStateListeners.delete(listener); } };
  } };
  const changeState = state => { appState.currentState = state; for (const listener of [...appStateListeners]) listener(state); };
  const seeds = [];
  let sdkStarts = 0;
  const fixture = hookFixture('hooks/useWalletAuth.ts', () => ({
    'react-native': { AppState: appState, Platform: { OS: options.os || 'android' } },
    bip39,
    'expo-crypto': { getRandomBytes: size => new Uint8Array(size).fill(42) },
    '../lib/wallet-session': { walletSession: session },
    '../lib/security-preferences': { securityPreferences: { getSnapshot: () => ({ lockOnOpen: options.lockOnOpen !== false }) } },
    '../lib/auth-diagnostics': { recordAuthDiagnostic() {}, categorizeAuthFailure: () => 'unknown' },
    '../lib/storage': {
      MNEMONIC_STORE_KEY: MNEMONIC,
      WALLET_IDENTITY_KEY: IDENTITY,
      WALLET_WIPE_PENDING_KEY: WIPE_PENDING,
      hasStoredMnemonic: async () => {
        if (storage.get(WIPE_PENDING) === 'true') throw new Error('Wallet removal must finish before continuing.');
        return storage.has(MNEMONIC) || storage.has(IDENTITY);
      },
      getSecureItem: async key => {
        if (key === MNEMONIC) await options.beforeMnemonicRead?.(changeState);
        return key === MNEMONIC && options.inaccessible?.value ? null : storage.get(key) ?? null;
      },
      getBiometricallyProtectedMnemonic: async () => {
        prompts.push('keychain');
        const value = storage.get(MNEMONIC) ?? null;
        await options.beforeProtectedRead?.(changeState);
        return options.protectedKey === false || options.inaccessible?.value ? null : value;
      },
      replaceInaccessibleMnemonic: async phrase => {
        writes.push({ operation: 'replace', key: MNEMONIC });
        storage.set(MNEMONIC, phrase);
        if (options.inaccessible) options.inaccessible.value = false;
      },
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
      withProtectedWalletAccess: async operation => {
        const attempt = session.beginDeviceAuthentication(true);
        try { const value = await operation(); attempt.complete()(); return value; }
        catch (cause) { attempt.cancel(); throw cause; }
      },
      readProtectedKeyForUnlock: async operation => {
        const value = await operation();
        if (appState.currentState !== 'active') throw new Error('Return to Opago and try again.');
        return value;
      },
    },
    '../lib/spark': { initializeSparkWallet: async () => {
      sdkStarts++; return options.sparkStart ? options.sparkStart() : { cleanupConnections: async () => {} };
    } },
    '../lib/session-resource': { SessionResource },
    '../lib/retry': { retryWithBackoff: fn => fn() },
    '../lib/ui-ready': { yieldToUi: async () => {} },
    '../lib/startup-timing': { beginWalletStartupTiming() {}, recordWalletStartupStage() {} },
    ...options.dependencies,
  }), exported => {
    const provider = exported.WalletProvider({ children: null });
    return provider.type(provider.props).props.value;
  });
  t.after(() => fixture.unmount());
  fixture.render();
  return { ...fixture, storage, writes, prompts, session, seeds, sdkStarts: () => sdkStarts,
    changeState };
}

test('a wallet with opening authentication disabled unlocks without a device prompt', async t => {
  for (const os of ['android', 'ios']) {
    const fixture = walletFixture(t, { storage: new Map([[MNEMONIC, PHRASE]]), lockOnOpen: false, os });
    await fixture.settle();
    await fixture.render().unlockWallet();
    assert.deepEqual(fixture.prompts, []);
    await fixture.settle();
    await fixture.render().loadOrGenerateWallet();
    await fixture.settle();
    assert.equal(fixture.render().walletReady, true);
  }
});

test('an ordinary HBAR send uses the checkout contract and retains the pending-transfer guard', async t => {
  const calls = [];
  const request = {
    merchantAccountId: '0.0.2222', amountTinybars: 1_000_000n,
    paymentId: '0x' + 'ab'.repeat(32),
  };
  const account = { accountId: '0.0.1111', balanceTinybars: 1_000_000_000n };
  const fixture = walletFixture(t, {
    storage: new Map([[MNEMONIC, PHRASE]]),
    dependencies: {
      '../lib/hedera/config': { HEDERA_NETWORK: 'testnet' },
      '../lib/hedera/account-binding-native': { resolveHederaWalletAccount: async () => account },
      '../lib/hedera/account': { loadHederaAccount: async () => account },
      '../lib/hedera/payment-journal-native': { hederaPaymentJournalFor: () => ({
        assertNoUnresolvedDirectPayment: async () => { calls.push('pending-guard'); },
        recordSubmitted: async item => { calls.push(['submitted', item.mode, item.paymentId]); },
        recordResolved: async () => { calls.push('resolved'); },
      }) },
      '../lib/hedera/checkout': {
        createHederaTransferCheckoutRequest: async input => {
          calls.push(['request', input.recipientAccountId, input.amountTinybars, input.nonce.length]);
          return request;
        },
        sendHederaCheckoutPayment: async input => {
          calls.push('contract-call'); input.assertAuthorized();
          await input.lifecycle.onSubmitted({
            transactionId: '0.0.1111@1700000000.000000001', mode: 'checkout',
            recipientAccountId: '0.0.2222', amountTinybars: 1_000_000n,
            paymentId: request.paymentId,
          });
          await input.lifecycle.onResolved({ transactionId: '0.0.1111@1700000000.000000001', state: 'confirmed', result: 'SUCCESS' });
          return { mode: 'checkout', status: 'SUCCESS', amountHbar: '0.01' };
        },
      },
      '../lib/hedera/payments': { assertHederaPaymentBalance: (_amount, _balance, mode) => calls.push(['fee-mode', mode]) },
      '../lib/payment-authorization': { authorizePayment: async () => () => { calls.push('authorized'); } },
    },
  });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  await fixture.render().loadOrGenerateWallet();
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true, fixture.render().error || 'wallet not ready');
  const result = await fixture.render().sendHederaPayment({ recipientAccountId: '0.0.2222', amountTinybars: 1_000_000n });
  assert.equal(result.status, 'SUCCESS');
  assert.deepEqual(calls.filter(item => item === 'contract-call'), ['contract-call']);
  assert.ok(calls.includes('pending-guard'));
  assert.ok(calls.some(item => Array.isArray(item) && item[0] === 'request' && item[3] === 32));
  assert.ok(calls.some(item => Array.isArray(item) && item[0] === 'fee-mode' && item[1] === 'checkout'));
  assert.ok(calls.some(item => Array.isArray(item) && item[0] === 'submitted' && item[1] === 'direct' && item[2] === request.paymentId));
});

test('iOS keychain Face ID can briefly background the app while the existing wallet opens', async t => {
  let reads = 0;
  const fixture = walletFixture(t, { os: 'ios', storage: new Map([[MNEMONIC, PHRASE]]),
    beforeProtectedRead: changeState => { reads++; changeState('background'); changeState('active'); } });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
  assert.equal(fixture.render().recoveryRequired, false);
  assert.equal(fixture.sdkStarts(), 1);
  assert.equal(reads, 1);
  assert.deepEqual(fixture.prompts, ['keychain']);
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
});

test('an interrupted iOS key read keeps the existing wallet and allows a later retry', async t => {
  let interrupt = true;
  const fixture = walletFixture(t, { os: 'ios', storage: new Map([[MNEMONIC, PHRASE]]),
    beforeProtectedRead: changeState => {
      if (!interrupt) return;
      interrupt = false;
      changeState('background');
      throw new Error('Authentication cancelled.');
    } });
  await fixture.settle();
  await assert.rejects(fixture.render().unlockWallet(), /cancelled/);
  await fixture.settle();
  assert.equal(fixture.render().recoveryRequired, false);
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
  fixture.changeState('active');
  await fixture.render().unlockWallet();
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
});

test('a legacy iOS key still requires device authentication before its phrase is read', async t => {
  const fixture = walletFixture(t, { os: 'ios', protectedKey: false, storage: new Map([[MNEMONIC, PHRASE]]) });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.render().loadOrGenerateWallet();
  await fixture.settle();
  assert.deepEqual(fixture.prompts, ['keychain', 'unlock']);
  assert.equal(fixture.render().walletReady, true);
});

test('a fresh iOS install opens onboarding even if initial AppState is inactive', async t => {
  const fixture = walletFixture(t, { os: 'ios', initialAppState: 'inactive' });
  const initial = await fixture.settle();
  assert.equal(initial.securityReady, true);
  assert.equal(initial.hasStoredWallet, false);
  assert.equal(initial.isLocked, true);
  fixture.changeState('active');
  await fixture.render().createWallet();
  await fixture.settle();
  assert.equal(fixture.render().hasStoredWallet, true);
  assert.equal(fixture.render().walletReady, true);
  fixture.changeState('background');
  fixture.changeState('active');
  await fixture.settle();
  assert.equal(fixture.render().isLocked, true);
});

test('restoring a fresh iOS install can establish a foreground session after startup', async t => {
  const fixture = walletFixture(t, { os: 'ios', initialAppState: 'inactive' });
  await fixture.settle();
  fixture.changeState('active');
  await fixture.render().restoreWallet(PHRASE);
  await fixture.settle();
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
  assert.equal(fixture.render().hasStoredWallet, true);
  assert.equal(fixture.render().walletReady, true);
});

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
test('a completed Spark startup failure can reconnect without replacing wallet keys', async t => {
  let failing = true;
  const fixture = walletFixture(t, { storage: new Map([[MNEMONIC, PHRASE]]),
    sparkStart: async () => {
      if (failing) throw new Error('synthetic connection failure');
      return { cleanupConnections: async () => {} };
    } });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  await fixture.render().loadOrGenerateWallet();
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
  assert.equal(fixture.render().sparkStatus, 'error');
  assert.equal(fixture.render().sparkWallet, null);
  failing = false;
  await fixture.render().retrySparkConnection();
  await fixture.settle();
  assert.equal(fixture.render().sparkStatus, 'ready');
  assert.ok(fixture.render().sparkWallet);
  assert.equal(fixture.sdkStarts(), 2);
  assert.equal(fixture.storage.get(MNEMONIC), PHRASE);
  assert.ok(fixture.seeds.every(seed => seed.every(byte => byte === 0)));
});

test('missing or inaccessible keys never silently create a replacement wallet', async t => {
  const fixture = walletFixture(t);
  await fixture.settle();
  await assert.rejects(fixture.render().loadOrGenerateWallet(), /new wallet will not be created/);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.sdkStarts(), 0);
  assert.equal(fixture.render().walletReady, false);
});
test('a lost protected key can be restored only with the matching saved wallet identity', async t => {
  const inaccessible = { value: true };
  const storage = new Map([[MNEMONIC, 'unreadable'], [IDENTITY, PUBLIC_KEY]]);
  const fixture = walletFixture(t, { storage, inaccessible });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  await assert.rejects(fixture.render().loadOrGenerateWallet(), /keys are unavailable/);
  await fixture.settle();
  assert.equal(fixture.render().recoveryRequired, true);
  await fixture.render().restoreWallet(PHRASE);
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
  assert.equal(fixture.render().recoveryRequired, false);
  assert.equal(storage.get(MNEMONIC), PHRASE);
  assert.equal(storage.get(IDENTITY), PUBLIC_KEY);
});
test('a different recovery phrase cannot replace inaccessible wallet data', async t => {
  const storage = new Map([[MNEMONIC, 'unreadable'], [IDENTITY, 'another-wallet']]);
  const fixture = walletFixture(t, { storage, inaccessible: { value: true } });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  await assert.rejects(fixture.render().loadOrGenerateWallet(), /keys are unavailable/);
  await fixture.settle();
  await assert.rejects(fixture.render().restoreWallet(PHRASE), /do not belong/);
  assert.equal(storage.get(MNEMONIC), 'unreadable');
  assert.equal(storage.get(IDENTITY), 'another-wallet');
  assert.equal(fixture.writes.some(item => item.operation === 'replace'), false);
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

test('retrying an interrupted startup wipe cannot reopen the removed iOS wallet', async t => {
  const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY], [WIPE_PENDING, 'true']]);
  let attempts = 0;
  const fixture = walletFixture(t, { os: 'ios', storage,
    beforeProtectedRead: () => assert.equal(storage.size, 0, 'removal must finish before reading keys'),
    dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
      if (++attempts === 1) throw new Error('Synthetic interrupted removal');
      storage.clear();
      return true;
    } } },
  });
  await fixture.settle();
  assert.equal(fixture.render().securityReady, true);
  assert.equal(fixture.render().hasStoredWallet, null);
  assert.equal(fixture.render().isLocked, true);
  await fixture.render().unlockWallet();
  await fixture.settle();
  assert.equal(attempts, 2);
  assert.equal(fixture.sdkStarts(), 0);
  assert.equal(fixture.render().hasStoredWallet, false);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(fixture.render().recoveryRequired, false);
  assert.equal(fixture.render().error, null);
  assert.deepEqual(fixture.writes, []);
  assert.equal(storage.size, 0);
});


test('a repeatedly failing removal keeps both platforms locked without reading or recreating keys', async t => {
  for (const os of ['android', 'ios']) {
    const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY], [WIPE_PENDING, 'true']]);
    let attempts = 0;
    const fixture = walletFixture(t, { os, storage,
      dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
        attempts++;
        throw new Error('Synthetic interrupted removal');
      } } },
    });
    await fixture.settle();
    await assert.rejects(fixture.render().unlockWallet(), /interrupted removal/);
    await assert.rejects(fixture.render().unlockWallet(), /interrupted removal/);
    await fixture.settle();
    assert.equal(attempts, 3);
    assert.equal(fixture.render().isLocked, true);
    assert.equal(fixture.render().walletReady, false);
    assert.equal(fixture.sdkStarts(), 0);
    assert.deepEqual(fixture.prompts, []);
    assert.deepEqual(fixture.writes, []);
    assert.equal(storage.get(MNEMONIC), PHRASE);
    assert.equal(storage.get(WIPE_PENDING), 'true');
  }
});

test('a removal started during iOS authentication discards the protected-key result', async t => {
  const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY]]);
  const fixture = walletFixture(t, { os: 'ios', storage,
    beforeProtectedRead: () => storage.set(WIPE_PENDING, 'true'),
    dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
      storage.clear();
      return true;
    } } },
  });
  await fixture.settle();
  assert.equal(fixture.render().hasStoredWallet, true);
  await fixture.render().unlockWallet();
  await fixture.settle();
  assert.deepEqual(fixture.prompts, ['keychain']);
  assert.equal(fixture.render().hasStoredWallet, false);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(fixture.sdkStarts(), 0);
  assert.deepEqual(fixture.writes, []);
  assert.equal(storage.size, 0);
});

test('Android can create a fresh 12-word wallet after retrying an interrupted removal', async t => {
  const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY], [WIPE_PENDING, 'true']]);
  let attempts = 0;
  const fixture = walletFixture(t, { storage,
    dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
      if (++attempts === 1) throw new Error('Synthetic interrupted removal');
      storage.clear();
      return true;
    } } },
  });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  assert.equal(fixture.render().hasStoredWallet, false);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(fixture.sdkStarts(), 0);
  assert.equal(fixture.render().error, null);
  await fixture.render().createWallet();
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
  assert.equal(fixture.render().hasStoredWallet, true);
  assert.equal(storage.get(MNEMONIC).split(' ').length, 12);
  assert.equal(bip39.validateMnemonic(storage.get(MNEMONIC)), true);
  assert.notEqual(storage.get(MNEMONIC), PHRASE);
  assert.deepEqual(fixture.prompts, ['unlock', 'authorize']);
});


test('a completed concurrent removal invalidates a protected key read started before the wipe marker persisted', async t => {
  for (const failAfterDeletion of [false, true]) {
    const markerWrite = deferred();
    const protectedRead = deferred();
    let delayRead = false;
    const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY]]);
    const fixture = walletFixture(t, { os: 'ios', storage,
      beforeWrite: key => key === WIPE_PENDING ? markerWrite.promise : undefined,
      beforeProtectedRead: () => delayRead ? protectedRead.promise : undefined,
      dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
        storage.clear();
        if (failAfterDeletion) throw new Error('Synthetic post-removal activation failure');
        return true;
      } } },
    });
    await fixture.settle();
    await fixture.render().unlockWallet();
    await fixture.settle();
    assert.equal(fixture.render().walletReady, true);
    assert.equal(fixture.sdkStarts(), 1);

    // Removal is authorized while foreground, but persisting its marker is slow.
    const wipeResult = fixture.render().wipeWallet().then(() => null, cause => cause);
    await fixture.settle();
    fixture.changeState('background');
    fixture.changeState('active');
    await fixture.settle();
    delayRead = true;
    const unlockResult = fixture.render().unlockWallet().then(() => null, cause => cause);
    await fixture.settle();
    markerWrite.resolve();
    const wipeError = await wipeResult;
    if (failAfterDeletion) assert.match(wipeError.message, /post-removal activation/);
    else assert.equal(wipeError, null);
    await fixture.settle();
    assert.equal(storage.size, 0);
    protectedRead.resolve();
    const unlockError = await unlockResult;
    assert.match(unlockError.message, /removal must finish/);
    await fixture.settle();
    assert.equal(fixture.sdkStarts(), 1, 'completed removal must invalidate the pre-wipe key read');
    assert.equal(fixture.render().walletReady, false);
    if (!failAfterDeletion) assert.equal(fixture.render().hasStoredWallet, false);
    assert.equal(storage.size, 0);
  }
});


test('unlock stays blocked while an authorized removal has not persisted its marker', async t => {
  const markerWrite = deferred();
  const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY]]);
  const fixture = walletFixture(t, { os: 'ios', storage,
    beforeWrite: key => key === WIPE_PENDING ? markerWrite.promise : undefined,
    dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
      storage.clear(); return true;
    } } },
  });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  const wipe = fixture.render().wipeWallet();
  await fixture.settle();
  fixture.changeState('background');
  fixture.changeState('active');
  await assert.rejects(fixture.render().unlockWallet(), /removal must finish/);
  await fixture.settle();
  assert.equal(fixture.sdkStarts(), 1);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(fixture.render().isLocked, true);
  assert.deepEqual(fixture.prompts, ['keychain']);
  markerWrite.resolve();
  await wipe;
  await fixture.settle();
  // Successful completion releases the in-flight guard for explicit onboarding.
  await fixture.render().createWallet();
  await fixture.settle();
  assert.equal(fixture.render().walletReady, true);
});

test('a protected read already in flight is invalidated when removal finishes before it returns', async t => {
  const protectedRead = deferred();
  let delayRead = false;
  const storage = new Map([[MNEMONIC, PHRASE], [IDENTITY, PUBLIC_KEY]]);
  const fixture = walletFixture(t, { os: 'ios', storage,
    beforeProtectedRead: () => delayRead ? protectedRead.promise : undefined,
    dependencies: { '../lib/wallet-wipe-native': { resumePendingWalletWipe: async () => {
      storage.clear(); return true;
    } } },
  });
  await fixture.settle();
  await fixture.render().unlockWallet();
  await fixture.settle();
  delayRead = true;
  const unlock = fixture.render().unlockWallet();
  await fixture.settle();
  await fixture.render().wipeWallet();
  await fixture.settle();
  assert.equal(storage.size, 0);
  protectedRead.resolve();
  await unlock;
  await fixture.settle();
  assert.equal(fixture.sdkStarts(), 1);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(fixture.render().hasStoredWallet, false);
  assert.equal(storage.size, 0);
});
