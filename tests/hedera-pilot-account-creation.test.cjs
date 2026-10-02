'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const { AccountCreateTransaction, Client, PrivateKey } = require('@hiero-ledger/sdk');
require('./register-typescript.cjs');

const PILOT_ENV_NAMES = [
  'EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED',
  'EXPO_PUBLIC_OPAGO_PILOT_PAYER_ACCOUNT_ID',
  'EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY',
  'EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR',
];
const originalPilotEnv = Object.fromEntries(PILOT_ENV_NAMES.map(name => [name, process.env[name]]));
test.after(() => {
  for (const name of PILOT_ENV_NAMES) {
    if (originalPilotEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalPilotEnv[name];
  }
});

let payerKey = PrivateKey.generateED25519();
const targetKey = PrivateKey.generateED25519();
const payerId = '0.0.123456';
const journal = new Map();
let existing = false;
let payerLookups = 0;
let executions = 0;

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent?.filename?.endsWith('pilot-account-creation-native.ts')) {
    if (request === '@react-native-async-storage/async-storage') {
      return { getItem: async key => journal.get(key) || null, setItem: async (key, value) => { journal.set(key, value); } };
    }
    if (request === './account') return { findHederaAccount: async () => existing ? { accountId: '0.0.999999' } : null };
    if (request === './config') return {
      HEDERA_NETWORK: 'testnet',
      createHederaClient: () => Client.forTestnet(),
      parseHederaAccountId: value => {
        if (!/^0\.0\.[1-9]\d*$/.test(value)) throw new Error('invalid payer');
        return value;
      },
    };
    if (request === './mirror') return { getMirrorAccountById: async () => {
      payerLookups += 1;
      return { account: payerId, key: { _type: payerKey.type === 'ED25519' ? 'ED25519' : 'ECDSA_SECP256K1', key: payerKey.publicKey.toStringRaw() },
        balance: { balance: '500000000' } };
    } };
    if (request === './payments') return { parseHbarToTinybars: raw => {
      if (!/^(0|[1-9]\d*)(?:\.\d{1,8})?$/.test(raw)) throw new Error('invalid amount');
      const [whole, fraction = ''] = raw.split('.');
      const value = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0') || '0');
      if (value <= 0n) throw new Error('zero amount');
      return value;
    } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let pilot;
try { pilot = require('../lib/hedera/pilot-account-creation-native.ts'); }
finally { Module._load = originalLoad; }

function setPilotEnvironment() {
  process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED = 'true';
  process.env.EXPO_PUBLIC_OPAGO_PILOT_PAYER_ACCOUNT_ID = payerId;
  process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY = payerKey.toStringRaw();
  process.env.EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR = '2';
}

test('pilot account creation requires explicit opt-in and caps the fee', () => {
  delete process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED;
  assert.equal(pilot.readPilotActivationSettings(), null);
  setPilotEnvironment();
  assert.equal(pilot.readPilotActivationSettings().maxFeeTinybars, 200000000n);
  process.env.EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR = '5.00000001';
  assert.throws(() => pilot.readPilotActivationSettings(), /too large/);
  setPilotEnvironment();
});

test('pilot creates a zero-balance account for the generated key exactly once', async t => {
  setPilotEnvironment();
  journal.clear();
  existing = false;
  payerLookups = 0;
  executions = 0;
  const originalExecute = AccountCreateTransaction.prototype.execute;
  AccountCreateTransaction.prototype.execute = async function execute() {
    executions += 1;
    assert.equal(journal.size, 1, 'transaction ID is saved before submission');
    const serialized = AccountCreateTransaction.fromBytes(this.toBytes());
    assert.equal(serialized.key.toStringRaw(), targetKey.publicKey.toStringRaw());
    assert.equal(serialized.initialBalance.toTinybars().toString(), '0');
    return { getReceipt: async () => ({ status: { toString: () => 'SUCCESS' }, accountId: '0.0.999999' }) };
  };
  t.after(() => { AccountCreateTransaction.prototype.execute = originalExecute; });
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1);
  assert.equal(JSON.parse([...journal.values()][0]).state, 'SUCCESS');
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1, 'local replay does not create another account');
  existing = true;
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1, 'already active account is never recreated');
  assert.equal(payerLookups, 1);
});

test('pilot accepts an ECDSA payer while assigning the Ed25519 wallet key', async t => {
  const originalPayerKey = payerKey;
  payerKey = PrivateKey.generateECDSA();
  t.after(() => { payerKey = originalPayerKey; });
  setPilotEnvironment();
  journal.clear();
  existing = false;
  const originalExecute = AccountCreateTransaction.prototype.execute;
  AccountCreateTransaction.prototype.execute = async function execute() {
    assert.equal(this.key.toStringRaw(), targetKey.publicKey.toStringRaw());
    assert.equal(this.initialBalance.toTinybars().toString(), '0');
    return { getReceipt: async () => ({ status: { toString: () => 'SUCCESS' }, accountId: '0.0.999999' }) };
  };
  t.after(() => { AccountCreateTransaction.prototype.execute = originalExecute; });
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(JSON.parse([...journal.values()][0]).state, 'SUCCESS');
});

test('an uncertain account creation remains journaled and is never automatically retried', async t => {
  setPilotEnvironment();
  journal.clear();
  existing = false;
  executions = 0;
  const originalExecute = AccountCreateTransaction.prototype.execute;
  AccountCreateTransaction.prototype.execute = async () => { executions += 1; throw new Error('network lost'); };
  t.after(() => { AccountCreateTransaction.prototype.execute = originalExecute; });
  await assert.rejects(pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw()), /network lost/);
  assert.equal(JSON.parse([...journal.values()][0]).state, 'pending');
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1);
});

test('store production rejects pilot credentials while the internal APK accepts them', () => {
  const priorProfile = process.env.EAS_BUILD_PROFILE;
  const priorKey = process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY;
  const priorEnabled = process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED;
  try {
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY = payerKey.toStringRaw();
    process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED = 'true';
    assert.throws(() => require('../app.config.js'), /cannot be included in a production build/);
    process.env.EAS_BUILD_PROFILE = 'production-apk';
    assert.doesNotThrow(() => require('../app.config.js'));
  } finally {
    if (priorProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = priorProfile;
    if (priorKey === undefined) delete process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY;
    else process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY = priorKey;
    if (priorEnabled === undefined) delete process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED;
    else process.env.EXPO_PUBLIC_OPAGO_PILOT_ACTIVATION_ENABLED = priorEnabled;
  }
});
