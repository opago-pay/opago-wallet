'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');
const { Client, PrivateKey, TransferTransaction } = require('@hiero-ledger/sdk');
require('./register-typescript.cjs');

const PILOT_ENV_NAMES = [
  'EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED',
  'EXPO_PUBLIC_OPAGO_PILOT_PAYER_ACCOUNT_ID',
  'EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY',
  'EXPO_PUBLIC_OPAGO_PILOT_AMOUNT_HBAR',
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
  if (parent?.filename?.endsWith('pilot-funding-native.ts')) {
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
try { pilot = require('../lib/hedera/pilot-funding-native.ts'); }
finally { Module._load = originalLoad; }

function setPilotEnvironment() {
  process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED = 'true';
  process.env.EXPO_PUBLIC_OPAGO_PILOT_PAYER_ACCOUNT_ID = payerId;
  process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY = payerKey.toStringRaw();
  process.env.EXPO_PUBLIC_OPAGO_PILOT_AMOUNT_HBAR = '1';
  process.env.EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR = '0.1';
}

test('pilot settings require explicit opt-in and cap the grant and fee', () => {
  delete process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED;
  assert.equal(pilot.readPilotFundingSettings(), null);
  setPilotEnvironment();
  assert.equal(pilot.readPilotFundingSettings().amountTinybars, 100000000n);
  process.env.EXPO_PUBLIC_OPAGO_PILOT_AMOUNT_HBAR = '1.00000001';
  assert.throws(() => pilot.readPilotFundingSettings(), /too large/);
  process.env.EXPO_PUBLIC_OPAGO_PILOT_AMOUNT_HBAR = '1';
  process.env.EXPO_PUBLIC_OPAGO_PILOT_MAX_FEE_HBAR = '0.10000001';
  assert.throws(() => pilot.readPilotFundingSettings(), /too large/);
  setPilotEnvironment();
});

test('pilot activation transfers exactly once to the generated key alias', async t => {
  setPilotEnvironment();
  journal.clear();
  existing = false;
  payerLookups = 0;
  executions = 0;
  const originalExecute = TransferTransaction.prototype.execute;
  TransferTransaction.prototype.execute = async function execute() {
    executions += 1;
    assert.equal(journal.size, 1, 'transaction ID is saved before submission');
    const transfers = TransferTransaction.fromBytes(this.toBytes()).hbarTransfersList
      .map(item => ({ account: item.accountId.toString(), amount: item.amount.toTinybars().toString() }));
    assert.deepEqual(transfers, [
      { account: payerId, amount: '-100000000' },
      { account: targetKey.publicKey.toAccountId(0, 0).toString(), amount: '100000000' },
    ]);
    return { getReceipt: async () => ({ status: { toString: () => 'SUCCESS' } }) };
  };
  t.after(() => { TransferTransaction.prototype.execute = originalExecute; });
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1);
  assert.equal(JSON.parse([...journal.values()][0]).state, 'SUCCESS');
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1, 'local replay does not send another transfer');
  existing = true;
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1, 'already active account is never funded');
  assert.equal(payerLookups, 1);
});

test('pilot activation accepts an ECDSA payer key without changing the Ed25519 recipient', async t => {
  const originalPayerKey = payerKey;
  payerKey = PrivateKey.generateECDSA();
  t.after(() => { payerKey = originalPayerKey; });
  setPilotEnvironment();
  journal.clear();
  existing = false;
  const originalExecute = TransferTransaction.prototype.execute;
  TransferTransaction.prototype.execute = async function execute() {
    const transfers = TransferTransaction.fromBytes(this.toBytes()).hbarTransfersList;
    assert.equal(transfers[1].accountId.toString(), targetKey.publicKey.toAccountId(0, 0).toString());
    return { getReceipt: async () => ({ status: { toString: () => 'SUCCESS' } }) };
  };
  t.after(() => { TransferTransaction.prototype.execute = originalExecute; });
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(JSON.parse([...journal.values()][0]).state, 'SUCCESS');
});

test('an uncertain submission remains journaled and is never automatically retried', async t => {
  setPilotEnvironment();
  journal.clear();
  existing = false;
  executions = 0;
  const originalExecute = TransferTransaction.prototype.execute;
  TransferTransaction.prototype.execute = async () => { executions += 1; throw new Error('network lost'); };
  t.after(() => { TransferTransaction.prototype.execute = originalExecute; });
  await assert.rejects(pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw()), /network lost/);
  assert.equal(JSON.parse([...journal.values()][0]).state, 'pending');
  await pilot.activateNewPilotWallet(targetKey.publicKey.toStringRaw());
  assert.equal(executions, 1);
});

test('the EAS store build rejects pilot credentials while the internal APK accepts them', () => {
  const priorProfile = process.env.EAS_BUILD_PROFILE;
  const priorKey = process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY;
  const priorEnabled = process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED;
  try {
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY = payerKey.toStringRaw();
    process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED = 'true';
    assert.throws(() => require('../app.config.js'), /cannot be included in a production build/);
    process.env.EAS_BUILD_PROFILE = 'production-apk';
    assert.doesNotThrow(() => require('../app.config.js'));
  } finally {
    if (priorProfile === undefined) delete process.env.EAS_BUILD_PROFILE;
    else process.env.EAS_BUILD_PROFILE = priorProfile;
    if (priorKey === undefined) delete process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY;
    else process.env.EXPO_PUBLIC_OPAGO_PILOT_PRIVATE_KEY = priorKey;
    if (priorEnabled === undefined) delete process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED;
    else process.env.EXPO_PUBLIC_OPAGO_PILOT_FUNDING_ENABLED = priorEnabled;
  }
});
