'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
require('./register-typescript.cjs');
const {loadHederaAccount}=require('../lib/hedera/account.ts');
const {PrivateKey}=require('@hiero-ledger/sdk');
const key=PrivateKey.fromStringED25519('11'.repeat(32)).publicKey.toStringRaw();
const record={account:'0.0.1234',deleted:false,balance:{balance:0},key:{_type:'ED25519',key}};
for(const [label,patch] of [
  ['foreign account ID',{account:'0.0.5678'}],
  ['foreign key',{key:{_type:'ED25519',key:PrivateKey.fromStringED25519('12'.repeat(32)).publicKey.toStringRaw()}}],
  ['wrong key algorithm',{key:{_type:'ECDSA_SECP256K1',key}}],
  ['deleted account',{deleted:true}],
  ['expired account',{expired_and_pending_removal:true}],
]) test('activation rejects '+label+' from Hedera before use',async()=>{
  const previous=global.fetch;
  global.fetch=async()=>new Response(JSON.stringify({...record,...patch}),{headers:{'content-type':'application/json'}});
  try {await assert.rejects(loadHederaAccount('0.0.1234',key));} finally {global.fetch=previous;}
});
test('activation accepts exact active account and verifies the official network endpoint',async()=>{
  const previous=global.fetch;
  global.fetch=async url=>{
    assert.match(url,/^https:\/\/testnet\.mirrornode\.hedera\.com\/api\/v1\/accounts\/0\.0\.1234$/);
    return new Response(JSON.stringify(record),{headers:{'content-type':'application/json'}});
  };
  try {const result=await loadHederaAccount('0.0.1234',key);assert.equal(result.accountId,'0.0.1234');assert.equal(result.publicKey,key);} finally {global.fetch=previous;}
});
