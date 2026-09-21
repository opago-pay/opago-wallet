'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
require('./register-typescript.cjs');
const { WalletSession, WALLET_IDLE_TIMEOUT_MS } = require('../lib/wallet-session.ts');
const { readBackupStatus } = require('../lib/wallet-backup.ts');
const { payPreparedSparkPayment } = require('../lib/payments.ts');
const { sanitizeNativeIntent } = require('../lib/native-intent.ts');

function isolatedModule(file, dependencies) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name);
    return dependencies[name];
  }, exports);
  return exports;
}

test('locking and re-unlocking permanently invalidates an earlier payment approval', () => {
  const session = new WalletSession();
  assert.throws(() => session.capture(), /unlock/i);
  session.unlock();
  const approval = session.capture();
  approval();
  session.lock();
  assert.throws(approval, /locked/i);
  session.unlock();
  assert.throws(approval, /locked/i);
  session.capture()();
});

test('inactivity expires a session even before the UI timer runs; interaction cannot revive it', () => {
  let now = 0;
  const session = new WalletSession(() => now);
  session.unlock();
  now = WALLET_IDLE_TIMEOUT_MS - 1;
  session.touch();
  now += WALLET_IDLE_TIMEOUT_MS;
  session.touch();
  assert.equal(session.isUnlocked(), false);
  assert.throws(() => session.capture(), /unlock/i);
});

function deviceAuthFixture({ level = 3, result = { success: true }, duringPrompt, allowDeviceCredential = false, androidVersion = 34, duringCheck } = {}) {
  const listeners = new Set();
  let prompts = 0;
  let removed = false;
  const session = new WalletSession();
  session.unlock();
  const appState = { currentState: 'active' };
  const changeState = state => { appState.currentState = state; session.handleAppState(state); for (const listener of [...listeners]) listener(state); };
  const deviceAuth = isolatedModule('lib/device-authentication.ts', {
    './i18n': require('../lib/i18n/index.ts'),
    './wallet-session': { walletSession: session },
    'react-native': {
      Platform: { OS: 'android', Version: androidVersion },
      AppState: Object.assign(appState, { addEventListener: (_name, cb) => {
        listeners.add(cb);
        return { remove() { removed = true; listeners.delete(cb); } };
      } }),
    },
    'expo-local-authentication': {
      SecurityLevel: { NONE: 0, BIOMETRIC_STRONG: 3 },
      getEnrolledLevelAsync: async () => { await duringCheck?.(changeState); return level; },
      cancelAuthenticate: async () => undefined,
      authenticateAsync: async options => {
        prompts++;
        assert.equal(options.disableDeviceFallback, !allowDeviceCredential);
        assert.equal(options.biometricsSecurityLevel, 'strong');
        await duringPrompt?.(changeState);
        return result;
      },
    },
  });
  return { ...deviceAuth, session, changeState, prompts: () => prompts, removed: () => removed };
}

test('explicit biometric-only authentication still rejects PIN-only and weak biometric levels', async () => {
  const pin = deviceAuthFixture();
  await pin.authenticateDevice('Confirm payment');
  assert.equal(pin.prompts(), 1);
  assert.equal(pin.removed(), true);
  for (const level of [0, 1, 2]) {
    const unsecured = deviceAuthFixture({ level });
    await assert.rejects(unsecured.authenticateDevice('Confirm payment'), /fingerprint/);
    assert.equal(unsecured.prompts(), 0);
    assert.equal(unsecured.removed(), true);
  }
});

test('cancelled authentication and leaving the app cannot authorize a payment', async () => {
  await assert.rejects(deviceAuthFixture({ result: { success: false, error: 'user_cancel' } }).authenticateDevice('Pay'), /cancelled/);
  await assert.rejects(deviceAuthFixture({ duringPrompt: cb => { cb('background'); cb('active'); } }).authenticateDevice('Pay'), /cancelled/);
  await deviceAuthFixture({ duringPrompt: cb => { cb('inactive'); cb('active'); } }).authenticateDevice('Pay');
});

test('unlocking an already locked wallet supports the separate Android PIN activity', async () => {
  const fixture = deviceAuthFixture({ level: 1, allowDeviceCredential: true, duringPrompt: cb => { cb('background'); cb('active'); } });
  await fixture.authenticateDevice('Unlock', { allowDeviceCredential: true });
  assert.equal(fixture.prompts(), 1);
  await assert.rejects(deviceAuthFixture({ level: 0 }).authenticateDevice('Unlock', { allowDeviceCredential: true }), /device PIN/);
});

test('PIN-only Android wallets authorize only after the system prompt succeeds in the foreground', async () => {
  const fixture = deviceAuthFixture({ level: 1, allowDeviceCredential: true, duringPrompt: change => {
    change('background');
    assert.throws(() => fixture.session.capture(), /unlock/i);
    change('active');
    assert.throws(() => fixture.session.capture(), /in progress/i);
  } });
  const oldApproval = fixture.session.capture();
  const approval = await fixture.authorizeWalletAction('Protect your new wallet');
  approval();
  assert.equal(fixture.prompts(), 1);
  assert.throws(oldApproval, /locked/i);
  fixture.changeState('background');
  assert.throws(approval, /locked/i);
});

test('weak face recognition can only proceed through the strong-biometric-or-device-credential system prompt', async () => {
  const fixture = deviceAuthFixture({ level: 2, allowDeviceCredential: true });
  (await fixture.authorizeWalletAction('Confirm this payment'))();
  assert.equal(fixture.prompts(), 1); // The fixture asserts biometricsSecurityLevel remains strong.
  const unsecured = deviceAuthFixture({ level: 0, allowDeviceCredential: true });
  await assert.rejects(unsecured.authorizeWalletAction('Create'), /device PIN/);
  assert.equal(unsecured.prompts(), 0);
});

test('cancelled PIN prompts revoke the attempt and lock a backgrounded wallet', async () => {
  const fixture = deviceAuthFixture({ level: 1, allowDeviceCredential: true, result: { success: false }, duringPrompt: change => {
    change('background'); change('active');
  } });
  await assert.rejects(fixture.authorizeWalletAction('Pay'), /cancelled/);
  assert.equal(fixture.session.isUnlocked(), false);
  fixture.session.unlock();
  const approval = fixture.session.capture();
  fixture.changeState('background');
  assert.throws(approval, /locked/i); // No abandoned prompt exemption remains.
});

test('manual locking or another unlock during PIN authentication cannot revive the pending action', async () => {
  const fixture = deviceAuthFixture({ level: 1, allowDeviceCredential: true, duringPrompt: () => {
    fixture.session.lock(); fixture.session.unlock();
  } });
  await assert.rejects(fixture.authorizeWalletAction('Restore'), /locked/i);
});

test('device-authentication attempts expire with the wallet idle timeout', () => {
  let now = 0;
  const session = new WalletSession(() => now);
  session.unlock();
  const attempt = session.beginDeviceAuthentication(true);
  session.handleAppState('background');
  now = WALLET_IDLE_TIMEOUT_MS;
  session.handleAppState('active');
  assert.throws(() => attempt.complete(), /locked/i);
  assert.equal(session.isUnlocked(), false);
  session.unlock();
  session.handleAppState('background');
  assert.equal(session.isUnlocked(), false);
});

test('authentication cannot complete while backgrounded and completion is one-use', () => {
  const session = new WalletSession();
  session.unlock();
  const attempt = session.beginDeviceAuthentication(true);
  session.handleAppState('background');
  assert.throws(() => attempt.complete(), /locked/i);
  session.handleAppState('active');
  session.unlock();
  const second = session.beginDeviceAuthentication(true);
  second.complete()();
  assert.throws(() => second.complete(), /locked/i);
});

test('the device credential result waits for Android to resume the foreground app', async () => {
  const fixture = deviceAuthFixture({ level: 1, allowDeviceCredential: true, duringPrompt: change => {
    change('background');
    setTimeout(() => change('active'), 20);
  } });
  (await fixture.authorizeWalletAction('Pay'))();
  const noReturn = deviceAuthFixture({ level: 1, allowDeviceCredential: true, duringPrompt: change => change('background') });
  await assert.rejects(noReturn.authorizeWalletAction('Pay'), /Return to Opago/);
  assert.equal(noReturn.session.isUnlocked(), false);
});

test('leaving before the native prompt starts does not grant a background exception', async () => {
  const fixture = deviceAuthFixture({ level: 1, allowDeviceCredential: true, duringCheck: change => {
    change('background'); change('active');
  } });
  await assert.rejects(fixture.authorizeWalletAction('Pay'), /cancelled/);
  assert.equal(fixture.prompts(), 0);
  assert.equal(fixture.session.isUnlocked(), false);
});

test('Android 10 PIN-only devices get a clear compatibility error; strong biometrics remain supported', async () => {
  const pin = deviceAuthFixture({ level: 1, androidVersion: 29 });
  await assert.rejects(pin.authorizeWalletAction('Create'), /Android 11/);
  assert.equal(pin.prompts(), 0);
  const biometric = deviceAuthFixture({ level: 3, androidVersion: 29 });
  (await biometric.authorizeWalletAction('Pay'))();
  assert.equal(biometric.prompts(), 1);
});

test('a PIN prompt preserves SDK startup but revokes old action approvals; a real lock revokes both', () => {
  const session = new WalletSession();
  session.unlock();
  const startup = session.captureRuntime();
  const previousApproval = session.capture();
  const prompt = session.beginDeviceAuthentication(true);
  session.handleAppState('background');
  startup();
  assert.throws(previousApproval, /locked/);
  session.handleAppState('active');
  const currentApproval = prompt.complete();
  startup();
  currentApproval();
  assert.throws(previousApproval, /locked/);
  session.handleAppState('background');
  assert.throws(startup, /locked/);
  assert.throws(currentApproval, /locked/);
});

test('locking disposes a late Spark startup before another session can initialize', async () => {
  const { SessionResource } = require('../lib/session-resource.ts');
  const resource = new SessionResource();
  const events = [];
  let finish;
  const first = resource.initialize(() => new Promise(resolve => { finish = resolve; }));
  await new Promise(resolve => setImmediate(resolve));
  resource.reset();
  const second = resource.initialize(async () => {
    events.push('second initialized');
    return { cleanupConnections: async () => { events.push('second disposed'); } };
  });
  finish({ cleanupConnections: async () => { events.push('first disposed'); } });
  assert.equal(await first, null);
  assert.ok(await second);
  assert.deepEqual(events, ['first disposed', 'second initialized']);
  resource.reset();
  assert.deepEqual(events, ['first disposed', 'second initialized', 'second disposed']);
});

test('a queued SDK startup is skipped entirely if its session locks', async () => {
  const { SessionResource } = require('../lib/session-resource.ts');
  const resource = new SessionResource();
  let starts = 0;
  const result = resource.initialize(async () => { starts++; return { cleanupConnections: async () => undefined }; });
  resource.reset();
  assert.equal(await result, null);
  assert.equal(starts, 0);
});

test('the maintained query parser preserves Expo Router query encoding and named exports', () => {
  const query = require('../lib/router-query-string.cjs');
  assert.equal(query.stringify({ a: 'hello world', tag: ['a', 'b'], nil: null, omit: undefined }), 'a=hello%20world&nil&tag=a&tag=b');
  assert.equal(query.stringify({ recipient: '0.0.123', amount: '1.25', note: 'a+b / café' }), 'amount=1.25&note=a%2Bb%20%2F%20caf%C3%A9&recipient=0.0.123');
  assert.deepEqual({ ...query.parse('a=hello%20world&nil&tag=a&tag=b') }, { a: 'hello world', nil: null, tag: ['a', 'b'] });
  for (const name of ['extract', 'parse', 'stringify', 'parseUrl', 'stringifyUrl', 'pick', 'exclude']) assert.equal(typeof query[name], 'function');
});

test('Lightning is never submitted if the wallet locks during the durable pending write', async () => {
  const session = new WalletSession();
  session.unlock();
  const approval = session.capture();
  let sent = false;
  const resolutions = [];
  await assert.rejects(payPreparedSparkPayment({ payLightningInvoice: async () => { sent = true; } }, {
    invoice: { invoice: 'public-test-fixture', paymentHash: 'a'.repeat(64), expiresAt: Date.now() + 60_000, amountSats: 20 },
    amountSats: 20, maxFeeSats: 5, estimatedFeeSats: 1,
  }, {
    onPending: async () => { session.lock(); session.unlock(); },
    onResolved: async (...args) => { resolutions.push(args); },
  }, approval), /locked/i);
  assert.equal(sent, false);
  assert.equal(resolutions[0][1], 'failed');
  assert.equal(resolutions[0][2], 'CANCELLED_BEFORE_SUBMISSION');
});

test('HBAR is never submitted if the wallet locks during the durable pending write', async () => {
  const { PrivateKey, TransferTransaction } = require('@hiero-ledger/sdk');
  const { sendHederaTransfer } = require('../lib/hedera/payments.ts');
  const execute = TransferTransaction.prototype.execute;
  let submissions = 0;
  let resolution;
  const session = new WalletSession();
  session.unlock();
  const approval = session.capture();
  TransferTransaction.prototype.execute = async () => { submissions++; throw new Error('Must not submit'); };
  try {
    await assert.rejects(sendHederaTransfer({
      sourceAccountId: '0.0.1234', recipientAccountId: '0.0.5678', amountTinybars: 1n,
      privateKey: PrivateKey.fromStringED25519('01'.repeat(32)), assertAuthorized: approval,
      lifecycle: {
        onSubmitted: async () => session.lock(),
        onResolved: async value => { resolution = value; },
      },
    }), /locked/i);
    assert.equal(submissions, 0);
    assert.equal(resolution.result, 'CANCELLED_BEFORE_SUBMISSION');
  } finally { TransferTransaction.prototype.execute = execute; }
});

test('optional haptic errors cannot escape into confirmed or failed payment handling', async () => {
  const haptics = isolatedModule('lib/optional-haptics.ts', {
    'expo-haptics': { notificationAsync: async () => { throw new Error('Motor unavailable'); } },
  });
  await haptics.notifyPaymentHaptics('success');
  await haptics.notifyPaymentHaptics('error');
});

test('backup verification cannot transfer to a different wallet or malformed record', () => {
  const record = JSON.stringify({ publicKey: 'wallet-one', status: 'verified' });
  assert.equal(readBackupStatus(record, 'wallet-one'), 'verified');
  assert.equal(readBackupStatus(record, 'wallet-two'), 'required');
  for (const value of [null, '', '{', 'null', '"verified"', '{}']) assert.equal(readBackupStatus(value, 'wallet-one'), 'required');
  assert.equal(readBackupStatus(JSON.stringify({ publicKey: 'wallet-one', status: 'deferred' }), 'wallet-one'), 'deferred');
});

test('external intents allow only bounded canonical checkout reviews', () => {
  const query = 'network=mainnet&contractId=0.0.123&merchant=0.0.456&merchantEvmAddress=0x123&amount=1&paymentId=0xabc&requestNonce=0xdef&expiresAt=123456';
  assert.equal(sanitizeNativeIntent('opagowallet://hedera-checkout?' + query), '/hedera-checkout?' + query);
  for (const input of [
    'opagowallet://(auth)/login', 'opagowallet://eid-success', 'https://evil.example/hedera-checkout?' + query,
    'opagowallet://hedera-checkout?' + query + '&amount=2',
    'opagowallet://hedera-checkout?' + query.replace('0xabc', '%25FF'),
    'opagowallet://hedera-checkout?' + query.replace('0xabc', '%FF'.repeat(1_000)),
    'opagowallet://hedera-checkout?' + query + '&unknown=true', 'x'.repeat(5_000),
  ]) assert.equal(sanitizeNativeIntent(input), '/');
});

test('identity data is rejected before any LNURL callback or eID request can be sent', async () => {
  const { fetchInvoiceFromLNURLP } = require('../lib/lnurl-safe.ts');
  const { startEIdSession, waitForVerifiedEId } = require('../lib/eid.ts');
  const fetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Network must not be reached'); };
  try {
    await assert.rejects(fetchInvoiceFromLNURLP('https://merchant.example/callback', 10, { name: 'Synthetic test user' }), /not supported/);
    await assert.rejects(fetchInvoiceFromLNURLP('https://merchant.example/callback?payerdata=synthetic', 10), /not supported/);
    await assert.rejects(startEIdSession({ walletIdentifier: 'test', transactionReference: 'test' }), /not supported/);
    await assert.rejects(waitForVerifiedEId('a'.repeat(24)), /not supported/);
    assert.equal(calls, 0);
  } finally { global.fetch = fetch; }
});
