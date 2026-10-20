'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sdk = require('@buildonspark/spark-sdk');
const bip39 = require('bip39');
require('./register-typescript.cjs');
const { BitcoinSparkWallet } = require('../lib/spark-bitcoin-wallet.ts');
const { lightningTransferId } = require('../lib/lightning/transfer-id.ts');
const { sparkTransferAmount } = require('../lib/lightning/transfer-amount.ts');
const baseline = require('./fixtures/spark-0712-identity.json');

test('published 0.14 signer restores every 0.7.12 synthetic identity, key family, leaf, deposit and address', async () => {
  for (const vector of baseline.vectors) {
    const mnemonic = bip39.entropyToMnemonic(Buffer.alloc(vector.entropyBytes, vector.entropyByte));
    for (const restored of [false, true]) {
      const signer = new sdk.DefaultSparkSigner();
      const seed = restored ? await signer.mnemonicToSeed(mnemonic) : bip39.mnemonicToSeedSync(mnemonic);
      assert.equal(await signer.createSparkWalletFromSeed(seed, vector.account), vector.identity);
      for (const [name, key] of Object.entries(vector.keys)) assert.equal(Buffer.from(signer[name].publicKey).toString('hex'), key, name);
      const derivations = [{type:sdk.KeyDerivationType.LEAF,path:'00000000-0000-4000-8000-000000000001'}, {type:sdk.KeyDerivationType.STATIC_DEPOSIT,path:0}];
      for (let i=0;i<derivations.length;i++) assert.equal(Buffer.from(await signer.getPublicKeyFromDerivation(derivations[i])).toString('hex'),vector.derived[i]);
      const wallet = new BitcoinSparkWallet({network:vector.network},signer);
      assert.equal(await wallet.getSparkAddress(),vector.address);
      seed.fill(0); await wallet.cleanup();
    }
  }
});

test('Lightning retry identity is an SDK UUID, stable across restart/case and different per invoice', () => {
  const a=lightningTransferId('ab'.repeat(32));
  assert.ok(a instanceof sdk.UUID);
  assert.equal(a.toString(),lightningTransferId('AB'.repeat(32)).toString());
  assert.notEqual(a.toString(),lightningTransferId('cd'.repeat(32)).toString());
  assert.throws(()=>lightningTransferId('invalid'));
});

test('multi-party history uses wallet shares only and never silently substitutes transfer totals', () => {
  const transfer={totalValue:100000,valueReceivedByWallet:7,valueSentByWallet:11};
  assert.equal(sparkTransferAmount({...transfer,transferDirection:'INCOMING'}),7);
  assert.equal(sparkTransferAmount({...transfer,transferDirection:'OUTGOING'}),11);
  for(const value of [undefined,null,'7',1.2,-1,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>sparkTransferAmount({...transfer,transferDirection:'INCOMING',valueReceivedByWallet:value}));
});
