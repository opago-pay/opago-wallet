'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
require('./register-typescript.cjs');
const {formatBtcBalance,MAX_BITCOIN_SATS}=require('../lib/bitcoin/amount.ts');
const {pendingOnchainDepositSats}=require('../lib/bitcoin/holdings.ts');
const {formatCoinUnitPrice}=require('../lib/wallet-display.ts');

test('BTC holdings retain single-sat precision and localize without float rounding at large balances',()=>{
  assert.equal(formatBtcBalance(1,'en-US'),'0.00000001');
  assert.equal(formatBtcBalance(107,'de-DE'),'0,00000107');
  assert.equal(formatBtcBalance(100_000_000,'de-DE'),'1');
  assert.equal(formatBtcBalance(MAX_BITCOIN_SATS-1,'en-US'),'20,999,999.99999999');
  assert.equal(formatBtcBalance(0,'en-US'),'0');
  for(const value of [NaN,-1,1.1,MAX_BITCOIN_SATS+1])assert.throws(()=>formatBtcBalance(value,'en-US'));
});

test('pending deposits exclude credited/failed entries and withdrawals, and count each output once',()=>{
  const deposit=(id,amountSats,state='action_required')=>({id,kind:'deposit',amountSats,state});
  assert.equal(pendingOnchainDepositSats([
    deposit('a',20),deposit('b',30,'pending'),deposit('c',100,'confirmed'),
    deposit('d',100,'failed'),deposit('e',100,'aborted'),
    {id:'withdrawal',kind:'withdrawal',state:'pending',amountSats:100},deposit('a',20),
  ]),50);
  assert.equal(pendingOnchainDepositSats([deposit('a',20),deposit('a',20,'confirmed')]),0);
  assert.equal(pendingOnchainDepositSats([]),0);
  assert.equal(pendingOnchainDepositSats([deposit('invalid',-1)]),null);
  assert.equal(pendingOnchainDepositSats([deposit('large',MAX_BITCOIN_SATS),deposit('overflow',1)]),null);
});

test('a small HBAR unit price remains visible instead of rounding to zero euros',()=>{
  assert.match(formatCoinUnitPrice(0.000123,'hedera'),/0[.,]000123/);
});
