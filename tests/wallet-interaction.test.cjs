'use strict';
/* global __dirname */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
require('./register-typescript.cjs');
const { WalletSession, WALLET_IDLE_TIMEOUT_MS } = require('../lib/wallet-session.ts');
const backup = require('../lib/wallet-backup.ts');

function load(file, dependencies, allowUnusedImports = false) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: file,
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (name === 'react/jsx-runtime') return require(name);
    if (name === '@/lib/theme-styles') return { adaptiveStyles: styles => styles, adaptColor: value => value };
    if (name === '@/lib/performance-trace' || name === '../lib/performance-trace') return require('./performance-trace-stub.cjs');
    if (name in dependencies) return dependencies[name];
    if (allowUnusedImports) return {};
    throw new Error('Unexpected dependency: ' + name);
  }, exports);
  return exports;
}

function interactionFixture() {
  let now = 0;
  const session = new WalletSession(() => now);
  session.unlock();
  const ui = load('components/ui/wallet-interaction.tsx', {
    react: { ...React, useRef: initial => ({ current: initial }) },
    'react-native': { TextInput: 'input', TouchableOpacity: 'button', Pressable: 'pressable', View: 'view' },
    '@/lib/wallet-session': { walletSession: session },
  });
  return { ...ui, session, advance: duration => { now += duration; } };
}

test('gestures, keyboard edits and accessible buttons keep an active wallet open beyond two minutes', () => {
  const fixture = interactionFixture();
  const boundary = fixture.WalletActivityBoundary({}).props;
  const input = fixture.TextInput.render({}, null).props;
  const button = fixture.TouchableOpacity.render({ onLongPress: () => {} }, null).props;
  const pressable = fixture.Pressable.render({}, null).props;
  const events = [
    () => assert.equal(boundary.onStartShouldSetResponderCapture({}), false),
    () => assert.equal(boundary.onMoveShouldSetResponderCapture({}), false),
    () => boundary.onTouchMove({}),
    () => boundary.onTouchEnd({}),
    () => input.onChangeText('public test text'),
    () => input.onKeyPress({ nativeEvent: { key: 'Backspace' } }),
    () => input.onSubmitEditing({}),
    () => button.onPress({}), // Also used by TalkBack and keyboard activation.
    () => button.onLongPress({}),
    () => pressable.onPressIn({}),
    () => pressable.onPress({}),
  ];
  for (const event of events) {
    fixture.advance(40_000);
    event();
    assert.equal(fixture.session.isUnlocked(), true);
  }
  fixture.advance(WALLET_IDLE_TIMEOUT_MS - 1);
  assert.equal(fixture.session.isUnlocked(), true);
  fixture.advance(1);
  assert.equal(fixture.session.isUnlocked(), false);
  input.onChangeText('late input');
  assert.equal(fixture.session.isUnlocked(), false);
});

test('all shared touch controls visibly dim only while pressed', () => {
  const fixture = interactionFixture();
  const touchable = fixture.TouchableOpacity.render({}, null).props;
  assert.equal(touchable.activeOpacity, 0.58);
  assert.equal(fixture.TouchableOpacity.render({ activeOpacity: 0.7 }, null).props.activeOpacity, 0.7);
  const pressable = fixture.Pressable.render({ style: { opacity: 0.8 } }, null).props;
  assert.deepEqual(pressable.style({ pressed: false }), [{ opacity: 0.8 }, undefined]);
  assert.deepEqual(pressable.style({ pressed: true }), [{ opacity: 0.8 }, { opacity: 0.58 }]);
  const disabled = fixture.Pressable.render({ disabled: true }, null).props;
  assert.deepEqual(disabled.style({ pressed: true }), [undefined, undefined]);
});

test('activity wrappers preserve callbacks, native input refs and child gesture ownership', () => {
  const fixture = interactionFixture();
  const calls = [];
  const reference = { current: null };
  assert.equal(fixture.TouchableOpacity.render({}, null).props.onLongPress, undefined);
  const event = { nativeEvent: { text: 'public fixture' } };
  const input = fixture.TextInput.render({
    onChangeText: value => calls.push(value), onKeyPress: value => calls.push(value), onSubmitEditing: value => calls.push(value),
    autoCorrect: false, editable: false,
  }, reference);
  assert.equal(input.props.ref, reference);
  assert.equal(input.props.autoCorrect, false);
  assert.equal(input.props.editable, false);
  input.props.onChangeText('typed'); input.props.onKeyPress(event); input.props.onSubmitEditing(event);
  const boundary = fixture.WalletActivityBoundary({ onStartShouldSetResponderCapture: () => true }).props;
  assert.equal(boundary.onStartShouldSetResponderCapture(event), true);
  const button = fixture.TouchableOpacity.render({ onPress: value => calls.push(value), disabled: true }, null);
  assert.equal(button.props.disabled, true);
  button.props.onPress(event);
  assert.deepEqual(calls, ['typed', event, event, event]);
  const pressable = fixture.Pressable.render({ onPress: value => calls.push(value), hitSlop: 8 }, reference);
  assert.equal(pressable.props.ref, reference);
  assert.equal(pressable.props.hitSlop, 8);
  assert.equal(pressable.props.onLongPress, undefined);
  pressable.props.onPress(event);
  assert.equal(calls.length, 5);
});

test('rendering and background/authentication events do not count as user activity', () => {
  const fixture = interactionFixture();
  fixture.advance(90_000);
  fixture.WalletActivityBoundary({}); fixture.TextInput.render({}, null); fixture.TouchableOpacity.render({}, null);
  fixture.advance(30_000);
  assert.equal(fixture.session.isUnlocked(), false);
  fixture.session.unlock();
  const prompt = fixture.session.beginDeviceAuthentication(true);
  fixture.session.handleAppState('background');
  fixture.advance(90_000);
  fixture.TextInput.render({}, null).props.onChangeText('late keyboard event');
  fixture.advance(30_000);
  fixture.session.handleAppState('active');
  assert.throws(() => prompt.complete(), /locked/i);
});

function backupProviderFixture(options = {}) {
  const states = [];
  let cursor = 0;
  let mounted = false;
  const effects = [];
  const cleanups = [];
  const session = new WalletSession();
  session.unlock();
  let finishBackup;
  const savedRecord = new Promise(resolve => { finishBackup = resolve; });
  const hooks = { ...React,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = { current: initial };
      return states[index];
    },
    useCallback: callback => callback,
    useMemo: callback => callback(),
    useEffect: callback => { if (options.effects && !mounted) effects.push(callback); },
  };
  const provider = load('hooks/useWalletAuth.ts', {
    react: hooks,
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '../lib/wallet-session': { walletSession: session },
    '../lib/storage': { hasStoredMnemonic: async () => true, MNEMONIC_STORE_KEY: 'mnemonic', getSecureItem: async key => key === 'mnemonic' ? 'public fixture only' : savedRecord },
    '../lib/wallet-keys': { deriveHederaPrivateKeyFromSeed: seed => { options.onDerive?.(seed); return { publicKey: { toStringRaw: () => 'wallet-one' } }; } },
    '../lib/wallet-seed-native': { deriveAuthenticatedWalletSeed: options.deriveSeed || (async () => new Uint8Array(64).fill(7)) },
    '../lib/spark': { initializeSparkWallet: options.initializeSpark },
    '../lib/retry': { retryWithBackoff: (operation, config) => require('../lib/retry.ts').retryWithBackoff(operation, { ...config, sleep: async () => {} }) },
    '../lib/wallet-backup': backup,
    '../lib/ui-ready': { yieldToUi: options.yieldToUi || (async () => {}) },
    '../lib/startup-timing': { recordWalletStartupStage: () => {}, beginWalletStartupTiming: () => {} },
    '../lib/hedera/account-binding-native': { resolveHederaWalletAccount: options.resolveAccount },
    '../lib/session-resource': options.runtime ? require('../lib/session-resource.ts') : { SessionResource: class { initialize() { return Promise.resolve(null); } reset() {} } },
  }, true);
  return {
    session,
    finishBackup,
    unmount() { for (const cleanup of cleanups) cleanup?.(); },
    render() {
      cursor = 0;
      const core = provider.WalletProvider({ children: null });
      const value = core.type(core.props).props.value;
      mounted = true;
      for (const effect of effects.splice(0)) cleanups.push(effect());
      return value;
    },
  };
}

test('a native seed completing after lock is erased without deriving keys or starting Spark', async t => {
  let finishSeed, keyReads = 0, sparkStarts = 0;
  const seed = new Uint8Array(64).fill(29);
  const fixture = backupProviderFixture({
    effects: true, runtime: true,
    deriveSeed: () => new Promise(resolve => { finishSeed = resolve; }),
    onDerive: () => { keyReads++; },
    initializeSpark: async () => { sparkStarts++; },
  });
  t.after(() => fixture.unmount());
  fixture.finishBackup(null);
  const pending = fixture.render().loadOrGenerateWallet();
  await new Promise(resolve => setImmediate(resolve));
  fixture.session.lock();
  finishSeed(seed);
  await assert.rejects(pending, /locked/i);
  assert.ok(seed.every(byte => byte === 0));
  assert.equal(keyReads, 0);
  assert.equal(sparkStarts, 0);
  assert.equal(fixture.render().walletReady, false);
});

test('one seed is shared across HBAR and Spark retries then erased after startup', async t => {
  let derivations = 0, attempts = 0, keys = 0;
  const seed = new Uint8Array(64).fill(21);
  const wallet = { cleanupConnections: async () => {} };
  const fixture = backupProviderFixture({
    effects: true, runtime: true,
    deriveSeed: async () => { derivations++; return seed; },
    onDerive: received => { assert.equal(received, seed); keys++; },
    initializeSpark: async received => {
      assert.equal(received, seed);
      assert.ok(received.every(byte => byte === 21));
      if (++attempts === 1) throw new Error('Network request failed');
      return wallet;
    },
  });
  t.after(() => fixture.unmount());
  fixture.finishBackup(null);
  await fixture.render().loadOrGenerateWallet();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(derivations, 1);
  assert.equal(keys, 1);
  assert.equal(attempts, 2);
  assert.ok(seed.every(byte => byte === 0));
  assert.equal(fixture.render().sparkWallet, wallet);
});

test('locking erases the retry seed immediately and disposes a late Spark wallet', async t => {
  let finishSpark, cleanups = 0;
  const seed = new Uint8Array(64).fill(17);
  const fixture = backupProviderFixture({
    effects: true, runtime: true, deriveSeed: async () => seed,
    initializeSpark: () => new Promise(resolve => { finishSpark = resolve; }),
  });
  t.after(() => fixture.unmount());
  fixture.finishBackup(null);
  await fixture.render().loadOrGenerateWallet();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.render().walletReady, true);
  fixture.session.lock();
  assert.ok(seed.every(byte => byte === 0));
  finishSpark({ cleanupConnections: async () => { cleanups++; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fixture.render().sparkWallet, null);
  assert.equal(fixture.render().walletReady, false);
  assert.equal(cleanups, 1);
});

test('a failure before Spark takes ownership erases the derived seed', async t => {
  const seed = new Uint8Array(64).fill(31);
  const fixture = backupProviderFixture({
    effects: true, runtime: true, deriveSeed: async () => seed,
    onDerive: () => { throw new Error('Key derivation failed'); },
  });
  t.after(() => fixture.unmount());
  fixture.finishBackup(null);
  await assert.rejects(fixture.render().loadOrGenerateWallet(), /Key derivation failed/);
  assert.ok(seed.every(byte => byte === 0));
  assert.equal(fixture.render().walletReady, false);
});

test('locking while the loading view paints cancels derivation before keys are accessed', async () => {
  let finishPaint;
  let derivations = 0;
  const fixture = backupProviderFixture({
    yieldToUi: () => new Promise(resolve => { finishPaint = resolve; }),
    onDerive: () => { derivations++; },
  });
  const initialization = fixture.render().loadOrGenerateWallet();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(derivations, 0);
  fixture.session.lock();
  finishPaint();
  await assert.rejects(initialization, /locked/i);
  assert.equal(derivations, 0);
  assert.equal(fixture.render().walletReady, false);
});

test('concurrent balance and history share one account lookup without caching future reads', async () => {
  let calls = 0;
  let finishLookup;
  const fixture = backupProviderFixture({ resolveAccount: () => {
    calls++;
    return new Promise(resolve => { finishLookup = resolve; });
  } });
  fixture.finishBackup(null);
  await fixture.render().loadOrGenerateWallet();
  const wallet = fixture.render();
  const first = wallet.refreshHederaAccount();
  const second = wallet.refreshHederaAccount();
  assert.equal(calls, 1);
  const account = { accountId: '0.0.123456', balanceTinybars: 123n };
  finishLookup(account);
  assert.deepEqual(await Promise.all([first, second]), [account, account]);
  const later = wallet.refreshHederaAccount();
  assert.equal(calls, 2);
  fixture.session.lock();
  finishLookup(account);
  await assert.rejects(later, /locked/i);
});

test('cold wallet initialization stays neutral until its own persisted backup status resolves', async () => {
  for (const [record, expected] of [
    [JSON.stringify({ publicKey: 'wallet-one', status: 'verified' }), 'verified'],
    [JSON.stringify({ publicKey: 'other-wallet', status: 'verified' }), 'required'],
    [null, 'required'],
  ]) {
    const fixture = backupProviderFixture();
    const initial = fixture.render();
    assert.equal(initial.backupStatus, 'loading');
    initial.beginBackup();
    assert.equal(fixture.render().backupStatus, 'loading');
    const initialization = initial.loadOrGenerateWallet();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.render().backupStatus, 'loading');
    fixture.finishBackup(record);
    await initialization;
    assert.equal(fixture.render().backupStatus, expected);
    assert.equal(fixture.render().walletReady, true);
  }
});

test('backup reminder stays hidden while loading and for verified backups, but appears for unverified wallets', () => {
  let status = 'loading';
  const { BackupReminder } = load('components/security/backup-prompt.tsx', {
    react: React,
    'react-native': { StyleSheet: { create: styles => styles }, Text: 'text' },
    '@/lib/i18n': { t: value => value },
    '@/hooks/useLanguage': { useLanguage: () => {} },
    '@/hooks/useWalletAuth': { useWalletAuth: () => ({ backupStatus: status }) },
    'expo-router': { useRouter: () => ({}) },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button' },
  });
  assert.equal(BackupReminder(), null);
  status = 'verified'; assert.equal(BackupReminder(), null);
  for (status of ['required', 'deferred', 'reviewing']) assert.equal(BackupReminder().type, 'button');
});
