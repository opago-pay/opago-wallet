'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const sdk = require('@buildonspark/spark-sdk');
const { invoice } = require('./lightning-invoice-fixture.cjs');
require('./register-typescript.cjs');
const { BitcoinSparkWallet } = require('../lib/spark-bitcoin-wallet.ts');
const { lightningTransferId } = require('../lib/lightning/transfer-id.ts');

// Actual 0.14 wallet -> transfer preparation -> Lightning service. Only leaf
// funding/signing and remote SO/SSP boundaries are synthetic; no network or funds.
function fixture() {
  const wallet = new BitcoinSparkWallet({network:'REGTEST'},new sdk.DefaultSparkSigner());
  const calls = {rpc:[],ssp:[],funding:[],released:[]};
  const identity = new Uint8Array(33).fill(7);
  wallet.config.signer.getIdentityPublicKey = async()=>identity;
  wallet.getLightningSendFeeEstimate = async()=>2;
  let failPackage=false, failRpc=false;
  wallet.leafManager.selectLeavesAndExecute=async(amounts,fn)=>{calls.funding.push(amounts);return fn({0:[{id:'synthetic-leaf',value:22}]});};
  wallet.leafManager.handleTransferEvent=async()=>{};
  wallet.leafManager.restoreLocalLockedToAvailable=ids=>calls.released.push(ids);
  wallet.transferService.prepareSendTransferKeyTweaks=async()=>new Map();
  wallet.transferService.prepareTransferPackageForLightning=async()=>{if(failPackage)throw Error('synthetic package failure');return {synthetic:true};};
  wallet.signingService.signRefunds=async()=>assert.fail('Obsolete second refund-signing phase must not run');
  wallet.connectionManager.createSparkClient=async()=>({
    get_signing_commitments:async()=>assert.fail('No speculative commitments in swap phase'),
    initiate_preimage_swap_v3:async(input,options)=>{
      calls.rpc.push({input,options}); if(failRpc)throw Error('synthetic lost reply');
      return {transfer:{id:input.transferRequest.transferId,leaves:[{leaf:{id:'synthetic-leaf'}}]}};
    },
  });
  wallet.getSspClient=()=>({requestLightningSend:async input=>{calls.ssp.push(input);return {id:'synthetic-request',status:'PENDING'};}});
  return {wallet,calls,setFailure:(kind,value)=>{if(kind==='package')failPackage=value;else failRpc=value;}};
}
const input=()=>({invoice:invoice(20),maxFeeSats:2,transferId:lightningTransferId('07'.repeat(32))});
test('SDK sends invoice, amount, fee and the same UUID through transfer, preimage swap and SSP',async()=>{
 const f=fixture(), p=input(); await f.wallet.payLightningInvoice(p);
 assert.deepEqual(f.calls.funding,[[22]]);assert.equal(f.calls.rpc.length,1);assert.equal(f.calls.ssp.length,1);
 const {input:wire,options}=f.calls.rpc[0];
 assert.equal(wire.transfer,undefined);assert.equal(wire.transferRequest.transferId,p.transferId.toString());
 assert.equal(options.metadata.get('x-idempotency-key'),p.transferId.toString());
 assert.equal(wire.invoiceAmount.invoiceAmountProof.bolt11Invoice,p.invoice);assert.equal(wire.invoiceAmount.valueSats,20);assert.equal(wire.feeSats,2);
 assert.equal(Buffer.from(wire.receiverIdentityPublicKey).toString('hex'),f.wallet.config.getSspIdentityPublicKey());
 assert.equal(f.calls.ssp[0].userOutboundTransferExternalId,p.transferId.toString());
});
test('real SDK rejects string IDs, wrong networks, fixed-invoice amount overrides and insufficient fees before funding',async()=>{
 for(const patch of [{transferId:'not-an-sdk-uuid'},{invoice:invoice(20,undefined,{network:'bc'})},{amountSatsToSend:21},{maxFeeSats:1}]){
  const f=fixture();await assert.rejects(f.wallet.payLightningInvoice({...input(),...patch}));assert.equal(f.calls.funding.length,0);assert.equal(f.calls.rpc.length,0);
 }
});
test('preparation failure dispatches nothing; lost RPC reply does not reach SSP and retry reuses identity',async()=>{
 const f=fixture(),p=input();f.setFailure('package',true);await assert.rejects(f.wallet.payLightningInvoice(p));assert.equal(f.calls.rpc.length,0);
 f.setFailure('package',false);f.setFailure('rpc',true);await assert.rejects(f.wallet.payLightningInvoice(p));assert.equal(f.calls.ssp.length,0);
 f.setFailure('rpc',false);await f.wallet.payLightningInvoice({...p,transferId:lightningTransferId('07'.repeat(32))});
 assert.equal(f.calls.rpc.length,2);assert.equal(f.calls.rpc[0].input.transferRequest.transferId,f.calls.rpc[1].input.transferRequest.transferId);
 // Remote deduplication is NOT simulated as proof of operator idempotency.
});
test('amountless invoice uses explicit sats on the SDK wire',async()=>{
 const f=fixture();await f.wallet.payLightningInvoice({...input(),invoice:invoice(null),amountSatsToSend:20});
 assert.equal(f.calls.rpc[0].input.invoiceAmount.valueSats,20);assert.equal(f.calls.ssp[0].amountSats,20);
});
