'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./register-typescript.cjs');
const { p2pkh, p2wpkh, p2sh, p2tr } = require('@scure/btc-signer/payment');
const { secp256k1 } = require('@noble/curves/secp256k1');
const { Transaction } = require('@scure/btc-signer');
const { readBitcoinBalance, btcToSats, satsToBtc } = require('../lib/bitcoin/amount.ts');
const { parseBitcoinDestination, validateBitcoinAddress, bitcoinNetwork } = require('../lib/bitcoin/destination.ts');
const { createBitcoinStore, BITCOIN_STORE_KEY } = require('../lib/bitcoin/store.ts');
const { prepareBitcoinWithdrawal, submitBitcoinWithdrawal, reconcileBitcoinWithdrawals, recoverBitcoinProviderWithdrawals, withdrawalResolution, scanBitcoinRequestPages } = require('../lib/bitcoin/onchain.ts');
const { createBitcoinRequestCursor } = require('../lib/bitcoin/request-cursor.ts');
const { createBitcoinDepositCursor } = require('../lib/bitcoin/deposit-cursor.ts');
const { prepareBitcoinDeposit, claimBitcoinDeposit, discoverBitcoinDeposits } = require('../lib/bitcoin/deposits.ts');
const { verifyDepositOutput } = require('../lib/bitcoin/chain-data.ts');
const { prepareDecodedSparkPayment } = require('../lib/payments.ts');
const { invoice } = require('./lightning-invoice-fixture.cjs');
// Other legacy suites configure their build environment before loading config.
// Keep our captured default regtest configuration from preloading theirs.
delete require.cache[require.resolve('../lib/config.ts')];
const key = secp256k1.getPublicKey(new Uint8Array(32).fill(17)); // Public synthetic test key, never funded.
const network = 'REGTEST';
const address = p2wpkh(key, bitcoinNetwork(network)).address;
const identity = Buffer.from(key).toString('hex');
const scope = `${network}:${identity}`;
const amount = value => ({ originalUnit: 'SATOSHI', originalValue: value });
const quote = (id = 'quote-1') => ({ id, network, totalAmount: amount(1000), expiresAt: new Date(Date.now() + 120000).toISOString(),
  l1BroadcastFeeMedium: amount(100), userFeeMedium: amount(20) });
const accepted = () => ({ id: 'provider-1', typename: 'CoopExitRequest', network, feeQuoteId: 'quote-1', status: 'INITIATED' });
function fixture(overrides = {}) {
  const memory = new Map();
  const storage = { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => memory.set(key, value), removeItem: async key => memory.delete(key) };
  const calls = [];
  const wallet = { getIdentityPublicKey: async () => identity,
    getBalance: async () => ({ satsBalance: { available: 5000n, owned: 6000n, incoming: 7000n } }),
    getWithdrawalFeeQuote: async input => { calls.push(['quote', input]); return quote(); },
    withdraw: async input => { calls.push(['withdraw', input]); return accepted(); },
    getCoopExitRequest: async () => accepted(),
    getUserRequests: async () => ({ entities: [], pageInfo: { hasNextPage: false } }),
    ...overrides,
  };
  return { wallet, calls, memory, storage, store: createBitcoinStore(storage) };
}
const prepare = wallet => prepareBitcoinWithdrawal(wallet, network, address, 1000, () => {});
const flush = () => new Promise(done => setImmediate(done));

test('available, reserved and incoming are separate, including the legacy available-only alias', async () => {
  assert.deepEqual(readBitcoinBalance({ balance: 100n, satsBalance: { available: 100n, owned: 140n, incoming: 30n } }), { available: 100, reserved: 40, incoming: 30 });
  assert.equal(readBitcoinBalance({ balance: 100n, satsBalance: { incoming: 30n } }).available, 100);
  for (const available of [undefined, null, -1, 1.5, true, '', Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => readBitcoinBalance({ balance: 100, satsBalance: { available } }));
  }
  const wallet = { getBalance: async () => ({ balance: 100n, satsBalance: { available: 100n, owned: 140n, incoming: 30n } }), getLightningSendFeeEstimate: async () => 1 };
  await assert.rejects(prepareDecodedSparkPayment(wallet, { invoice: 'synthetic', amountSats: 100, paymentHash: 'a'.repeat(64), expiresAt: Date.now() + 60000 }), /balance/i);
});
test('BTC decimals are exact integer sats and reject fractional satoshis, signs, exponents and overflow', () => {
  assert.equal(btcToSats('0.00000001'), 1); assert.equal(btcToSats('0.10000001'), 10000001);
  assert.equal(satsToBtc(2100000000000000), '21000000.00000000');
  for (const value of ['0.000000001', '-1', '1e-8', '1,2', '+1', '21000001', 'NaN', '.1']) assert.throws(() => btcToSats(value));
});
test('Bitcoin addresses validate full checksums and network for legacy, nested SegWit, native SegWit and Taproot', () => {
  for (const output of [p2pkh(key, bitcoinNetwork(network)), p2sh(p2wpkh(key, bitcoinNetwork(network)), bitcoinNetwork(network)), p2wpkh(key, bitcoinNetwork(network)), p2tr(key.slice(1), undefined, bitcoinNetwork(network))]) {
    assert.equal(validateBitcoinAddress(output.address, network), output.address);
    assert.throws(() => validateBitcoinAddress(output.address, 'MAINNET'));
    const corrupted = output.address.slice(0, -1) + (output.address.endsWith('q') ? 'p' : 'q');
    assert.throws(() => validateBitcoinAddress(corrupted, network));
  }
});
test('BIP321 case-insensitive keys preserve exact amount and tolerate permitted optional duplicates', () => {
  const parsed = parseBitcoinDestination(`BITCOIN:${address}?AMOUNT=0.00001&Label=Cafe&foo=a&foo=b`);
  assert.equal(parsed.route, 'onchain'); assert.equal(parsed.amountSats, 1000); assert.equal(parsed.label, 'Cafe');
  for (const query of ['amount=1&AMOUNT=2', 'label=x&LABEL=y', 'message=x&message=y', 'pop=x&pop=y', 'req-unknown=x', 'amount=1e-8', 'amount=0', 'label=%zz']) {
    assert.throws(() => parseBitcoinDestination(`bitcoin:${address}?${query}`));
  }
});
test('a combined request validates both routes before selecting Lightning; expiry gives an explicit onchain alternative', () => {
  const ln = invoice(1000);
  const parsed = parseBitcoinDestination(`bitcoin:${address}?amount=0.00001&lightning=${ln}&LIGHTNING=${ln}`);
  assert.equal(parsed.route, 'lightning'); assert.equal(parsed.address, address);
  assert.throws(() => parseBitcoinDestination(`bitcoin:${address}?amount=0.00002&lightning=${ln}`), /conflicting/);
  assert.throws(() => parseBitcoinDestination(`bitcoin:${address}?lightning=${ln}&lightning=${invoice(1001)}`), /Ambiguous/);
  assert.throws(() => parseBitcoinDestination(`bitcoin:${address}?lightning=broken`));
  const expired = invoice(1000, Math.floor(Date.now()/1000) - 10000);
  assert.equal(parseBitcoinDestination(`bitcoin:${address}?lightning=${expired}`).alternativeReason, 'lightning-expired');
  assert.throws(() => parseBitcoinDestination(`bitcoin:${address}?amount=0.00002&lightning=${expired}`), /conflicting/);
  assert.equal(parseBitcoinDestination('person@example.com'), null);
  assert.equal(parseBitcoinDestination('hedera:0.0.123?amount=1'), null);
});
test('onchain offer requires preparation authorization, includes both fees and submits exact recipient amount plus fee', async () => {
  const f = fixture(); const payment = await prepare(f.wallet);
  assert.equal(payment.feeSats, 120); assert.equal(payment.totalSats, 1120);
  const result = await submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {});
  const input = f.calls.find(row => row[0] === 'withdraw')[1];
  assert.equal(input.amountSats, 1000); assert.equal(input.feeAmountSats, 120); assert.equal(input.deductFeeFromWithdrawalAmount, false);
  assert.equal(input.onchainAddress, address); assert.equal(result.state, 'pending');
  await assert.rejects(submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {}), /still being checked/);
  assert.equal(f.calls.filter(row => row[0] === 'withdraw').length, 1);
});
test('a locked preparation does not invoke Spark quote signing', async () => {
  const f = fixture(); await assert.rejects(prepareBitcoinWithdrawal(f.wallet, network, address, 1000, () => { throw new Error('locked'); }), /locked/);
  assert.equal(f.calls.length, 0);
});
test('a timed-out SDK quote cannot start a concurrent signing preparation', async t => {
  let finish;let calls=0;const f=fixture({getWithdrawalFeeQuote:()=>{calls++;return new Promise(resolve=>{finish=resolve})}});
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=prepare(f.wallet);const rejected=assert.rejects(pending,/timed out/);
  await flush();t.mock.timers.tick(30001);await rejected;
  await assert.rejects(prepare(f.wallet),/still being checked/);assert.equal(calls,1);
  finish(quote());await flush();f.wallet.getWithdrawalFeeQuote=async()=>quote();assert.equal((await prepare(f.wallet)).amountSats,1000);
});
test('new balance, expired quote and malformed fee units reject before any withdrawal', async () => {
  for (const change of ['balance', 'expiry', 'unit']) {
    const f = fixture(); const payment = await prepare(f.wallet);
    if (change === 'balance') f.wallet.getBalance = async () => ({ balance: 999999n, satsBalance: { available: 1000n, owned: 5000n, incoming: 9000n } });
    if (change === 'expiry') { await assert.rejects(submitBitcoinWithdrawal(f.wallet, f.store, { ...payment, expiresAt: 1 }, () => {}), /expired/); }
    else if (change === 'unit') { f.wallet.getWithdrawalFeeQuote = async () => ({ ...quote(), userFeeMedium: { originalUnit: 'MILLISATOSHI', originalValue: 20 } }); await assert.rejects(prepare(f.wallet), /fee quote/); }
    else await assert.rejects(submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {}), /balance/);
    assert.equal(f.calls.some(row => row[0] === 'withdraw'), false);
  }
});
test('simultaneous send attempts durably allow exactly one withdrawal', async () => {
  const f = fixture(); const payment = await prepare(f.wallet);
  const outcomes = await Promise.allSettled([submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {}), submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {})]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(f.calls.filter(row => row[0] === 'withdraw').length, 1);
});
test('post-submit timeout survives process recreation and recovers only by exact quote ID', async t => {
  const f = fixture({ withdraw: () => new Promise(() => {}) }); const payment = await prepare(f.wallet);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {});
  await flush(); t.mock.timers.tick(45001);
  assert.equal((await pending).state, 'checking');
  const restarted = createBitcoinStore(f.storage);
  await assert.rejects(submitBitcoinWithdrawal(f.wallet, restarted, payment, () => {}), /still being checked/);
  f.wallet.getUserRequests = async () => ({ entities: [accepted()], pageInfo: { hasNextPage: false } });
  const records = await reconcileBitcoinWithdrawals(f.wallet, restarted, scope, () => {});
  assert.equal(records[0].requestId, 'provider-1'); assert.equal(records[0].state, 'pending');
});
test('null SDK submission and persistence gap stay ambiguous, including after restart', async () => {
  const f = fixture({ withdraw: async () => null }); const payment = await prepare(f.wallet);
  assert.equal((await submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {})).state, 'checking');
  assert.equal((await createBitcoinStore(f.storage).list(scope))[0].state, 'checking');
  assert.deepEqual(await f.store.list('MAINNET:another-wallet'), []);
  await f.store.clear(); assert.equal(f.memory.has(BITCOIN_STORE_KEY), false);
});
test('authorization loss after durable reservation aborts before SDK submission', async () => {
  const f = fixture();
  const payment = await prepare(f.wallet);
  let authorized = true;
  const originalWrite = f.storage.setItem;
  f.storage.setItem = async (key, value) => {
    await originalWrite(key, value);
    if (JSON.parse(value).records[0]?.state === 'checking') authorized = false;
  };
  await assert.rejects(submitBitcoinWithdrawal(f.wallet, f.store, payment, () => {
    if (!authorized) throw new Error('locked');
  }), /locked/);
  assert.equal(f.calls.filter(row => row[0] === 'withdraw').length, 0);
  assert.equal((await f.store.list(scope))[0].state, 'aborted');
  authorized = true;
  const next = { ...payment, quoteId: 'quote-2' };
  assert.equal((await submitBitcoinWithdrawal(f.wallet, f.store, next, () => {})).state, 'checking');
  assert.equal(f.calls.filter(row => row[0] === 'withdraw').length, 1);
});

test('a quote match beyond twenty provider pages is found across app restarts without rescanning the first page', async () => {
  const seen = [];
  const f = fixture({ getUserRequests: async ({ after, types }) => {
    assert.deepEqual(types, ['COOP_EXIT']);
    const index = after ? Number(after.slice(1)) : 0;
    seen.push(index);
    return { entities: index === 24 ? [accepted()] : [],
      pageInfo: { hasNextPage: index < 24, endCursor: `p${index + 1}` } };
  } });
  const payment = await prepare(f.wallet);
  await f.store.begin({ id: `withdraw:${payment.quoteId}`, scope, network, kind: 'withdrawal',
    address, amountSats: payment.amountSats, feeSats: payment.feeSats,
    quoteId: payment.quoteId, state: 'checking', createdAt: new Date().toISOString() }, () => {});
  for (let poll = 0; poll < 7; poll++) {
    const restartedCursor = createBitcoinRequestCursor(f.storage);
    await reconcileBitcoinWithdrawals(f.wallet, createBitcoinStore(f.storage), scope, () => {}, restartedCursor);
  }
  assert.deepEqual(seen, Array.from({ length: 25 }, (_, index) => index));
  assert.equal((await f.store.list(scope))[0].requestId, 'provider-1');
  assert.equal((await f.store.list(scope))[0].state, 'pending');
});

test('provider cursor commits only after a page is processed and wallet removal clears it', async () => {
  const f = fixture({ getUserRequests: async ({ after }) => ({ entities: [accepted()],
    pageInfo: { hasNextPage: true, endCursor: after ? 'p2' : 'p1' } }) });
  const cursor = createBitcoinRequestCursor(f.storage);
  await assert.rejects(scanBitcoinRequestPages(f.wallet, cursor, scope, 'withdrawal',
    async () => { throw new Error('write failed'); }, () => {}, 1), /write failed/);
  assert.equal(await cursor.hasPending(scope, 'withdrawal'), false);
  assert.equal(await scanBitcoinRequestPages(f.wallet, cursor, scope, 'withdrawal', async () => {}, () => {}, 1), false);
  assert.equal(await cursor.hasPending(scope, 'withdrawal'), true);
  await cursor.clear();
  assert.equal(await createBitcoinRequestCursor(f.storage).hasPending(scope, 'withdrawal'), false);
});

test('withdrawal restore and unresolved-request lookup keep independent cursors', async () => {
  const pages = [];
  const f = fixture({ getUserRequests: async ({ after }) => {
    pages.push(after ?? 'start');
    return { entities: [], pageInfo: { hasNextPage: true, endCursor: after ? 'p2' : 'p1' } };
  } });
  const cursor = createBitcoinRequestCursor(f.storage);
  assert.equal(await scanBitcoinRequestPages(f.wallet, cursor, scope, 'withdrawal',
    async () => {}, () => {}, 1), false);
  assert.equal(await scanBitcoinRequestPages(f.wallet, cursor, scope, 'withdrawal-lookup',
    async () => {}, () => {}, 1), false);
  assert.equal(await cursor.hasPending(scope, 'withdrawal'), true);
  assert.equal(await cursor.hasPending(scope, 'withdrawal-lookup'), true);
  const restarted = createBitcoinRequestCursor(f.storage);
  assert.equal(await scanBitcoinRequestPages(f.wallet, restarted, scope, 'withdrawal',
    async () => {}, () => {}, 1), false);
  assert.deepEqual(pages, ['start', 'start', 'p1']);
});

test('seed-restored provider withdrawal blocks a new send without inventing its amount or recipient', async () => {
  const old = { ...accepted(), id: 'old-request', feeQuoteId: 'old-quote',
    createdAt: '2026-09-20T10:00:00.000Z', status: 'INITIATED' };
  const f = fixture({ getUserRequests: async () => ({ entities: [old], pageInfo: { hasNextPage: false } }),
    getCoopExitRequest: async () => old });
  const cursor = createBitcoinRequestCursor(f.storage);
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), true);
  const [recovered] = await f.store.list(scope);
  assert.equal(recovered.recoveredFromProvider, true);
  assert.equal(recovered.state, 'pending');
  assert.equal(recovered.amountSats, 0);
  assert.equal(recovered.address, '');
  await assert.rejects(prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, cursor), /still being checked/);
  assert.equal(f.calls.some(([kind]) => kind === 'quote'), false);

  old.status = 'SUCCEEDED';
  await reconcileBitcoinWithdrawals(f.wallet, f.store, scope, () => {}, cursor);
  assert.equal((await f.store.list(scope))[0].state, 'confirmed');
  assert.equal((await prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, cursor)).amountSats, 1000);
});

test('a partial provider restore fails closed before any quote signing and resumes at its cursor', async () => {
  const seen = [];
  const f = fixture({ getUserRequests: async ({ after }) => {
    const index = after ? Number(after.slice(1)) : 0;
    seen.push(index);
    return { entities: [], pageInfo: { hasNextPage: index < 5, endCursor: `p${index + 1}` } };
  } });
  const cursor = createBitcoinRequestCursor(f.storage);
  await assert.rejects(prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, cursor), /recovery is still checking/);
  assert.equal(f.calls.some(([kind]) => kind === 'quote'), false);
  await assert.rejects(prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, createBitcoinRequestCursor(f.storage)), /recovery is still checking/);
  assert.equal((await prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, createBitcoinRequestCursor(f.storage))).amountSats, 1000);
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0]);
});

test('a completed historical restore does not force another full scan before each payment', async () => {
  const seen = [];
  const f = fixture({ getUserRequests: async ({ after }) => {
    const index = after ? Number(after.slice(1)) : 0;
    seen.push(index);
    const entities = Array.from({ length: 50 }, (_, item) => ({
      id: `old-${index}-${item}`, typename: 'CoopExitRequest', network,
      feeQuoteId: `old-quote-${index}-${item}`, status: 'SUCCEEDED',
      createdAt: '2026-09-24T00:00:00.000Z',
    }));
    return { entities, pageInfo: { hasNextPage: index < 5, endCursor: `p${index + 1}` } };
  } });
  const cursor = createBitcoinRequestCursor(f.storage);
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), false);
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), true);
  assert.equal((await prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, cursor)).amountSats, 1000);
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 0, 0, 0, 0]);
});
test('authorization loss before checking does not strand a prepared withdrawal', async () => {
  const f = fixture();
  const payment = await prepare(f.wallet);
  let authorized = true;
  const originalWrite = f.storage.setItem;
  f.storage.setItem = async (key, value) => {
    await originalWrite(key, value);
    if (JSON.parse(value).records[0]?.state === 'prepared') authorized = false;
  };
  await assert.rejects(submitBitcoinWithdrawal(f.wallet, f.store, payment,
    () => { if (!authorized) throw new Error('locked'); }), /locked/);
  assert.equal((await f.store.list(scope))[0].state, 'aborted');
  assert.equal(f.calls.filter(row => row[0] === 'withdraw').length, 0);
});
test('a prepared withdrawal left by a stopped process is released without submission', async () => {
  const f = fixture();
  const payment = await prepare(f.wallet);
  await f.store.begin({ id: `withdraw:${payment.quoteId}`, scope, network, kind: 'withdrawal',
    address, amountSats: payment.amountSats, feeSats: payment.feeSats,
    quoteId: payment.quoteId, state: 'prepared', createdAt: new Date().toISOString() }, () => {});
  const records = await reconcileBitcoinWithdrawals(f.wallet, createBitcoinStore(f.storage), scope, () => {});
  assert.deepEqual(records, []);
  assert.equal((await createBitcoinStore(f.storage).list(scope))[0].state, 'aborted');
  assert.equal(f.calls.filter(row => row[0] === 'withdraw').length, 0);
});
function rawTransaction() {
  const tx = new Transaction({ allowUnknownInputs: true, allowUnknownOutputs: true });
  tx.addOutputAddress(address, 1000n, bitcoinNetwork(network));
  tx.addInput({ txid: '11'.repeat(32), index: 0, finalScriptSig: new Uint8Array([0]) });
  return tx;
}
test('withdrawal success needs the matching network, quote and exact recipient output', () => {
  const tx = rawTransaction();
  const record = { address, amountSats: 1000, feeSats: 120, network, quoteId: 'quote-1' };
  const request = { ...accepted(), status: 'SUCCEEDED', rawCoopExitTransaction: Buffer.from(tx.toBytes(true, true)).toString('hex'), fee: amount(20), l1BroadcastFee: amount(100) };
  assert.equal(withdrawalResolution(record, request).state, 'confirmed');
  assert.equal(withdrawalResolution(record, request).actualFeeSats, 120);
  assert.equal(withdrawalResolution(record, { ...request, fee: amount(10) }).actualFeeSats, 110);
  assert.equal(withdrawalResolution({ ...record, amountSats: 999 }, request).state, 'pending');
  assert.equal(withdrawalResolution({ ...record, amountSats: 999 }, request).actualFeeSats, undefined);
  assert.deepEqual(withdrawalResolution(record, { ...request, feeQuoteId: 'other' }), {});
  assert.equal(withdrawalResolution(record, { ...request, status: 'TX_BROADCASTED' }).state, 'broadcast');
  assert.equal(withdrawalResolution(record, { ...accepted(), status: 'FAILED' }).state, 'failed');
  assert.equal(withdrawalResolution(record, { ...accepted(), status: 'EXPIRED' }).state, 'failed');
});
test('deposit verification checks txid, exact vout script and amount', () => {
  const tx = rawTransaction(); const raw = Buffer.from(tx.toBytes(true, true)).toString('hex');
  assert.equal(verifyDepositOutput(raw, tx.id, 0, address, network), 1000);
  assert.throws(() => verifyDepositOutput(raw, '22'.repeat(32), 0, address, network));
  assert.throws(() => verifyDepositOutput(raw, tx.id, 1, address, network));
});
test('deposit recognition deduplicates txid:vout and never marks an unclaimed input available', async () => {
  const f = fixture({ queryStaticDepositAddresses: async () => [address], getUtxosForDepositAddress: async () => [{ txid: '22'.repeat(32), vout: 0 }] });
  let writes = 0;
  const originalWrite = f.storage.setItem;
  f.storage.setItem = async (...args) => { writes++; return originalWrite(...args); };
  await discoverBitcoinDeposits(f.wallet, f.store, network, () => {});
  const records = await discoverBitcoinDeposits(f.wallet, f.store, network, () => {});
  assert.equal(records.length, 1); assert.equal(records[0].state, 'action_required'); assert.equal(records[0].amountSats, 0);
  assert.equal(writes, 1);
});

test('a page of new static deposits causes one operation-store write and unchanged polls cause none', async () => {
  const outputs = Array.from({ length: 100 }, (_, vout) => ({ txid: '88'.repeat(32), vout }));
  const f = fixture({ queryStaticDepositAddresses: async () => [address],
    getUtxosForDepositAddress: async (_address, _limit, offset) => offset ? [] : outputs });
  let writes = 0;
  const originalWrite = f.storage.setItem;
  f.storage.setItem = async (key, value) => {
    if (key === BITCOIN_STORE_KEY) writes++;
    await originalWrite(key, value);
  };
  await discoverBitcoinDeposits(f.wallet, f.store, network, () => {},
    createBitcoinRequestCursor(f.storage), createBitcoinDepositCursor(f.storage));
  assert.equal(writes, 1);
  assert.equal((await f.store.list(scope)).length, 100);
  await discoverBitcoinDeposits(f.wallet, f.store, network, () => {},
    createBitcoinRequestCursor(f.storage), createBitcoinDepositCursor(f.storage));
  assert.equal(writes, 1);
});

test('local onchain history pages remain stable when a newer operation arrives', async () => {
  const f = fixture();
  const base = Date.now() - 60_000;
  const operation = index => {
    const txid = index.toString(16).padStart(64, '0');
    return { id: `deposit:${network}:${txid}:0`, scope, network, kind: 'deposit', address,
      amountSats: 0, feeSats: null, state: 'action_required', txid, vout: 0,
      createdAt: new Date(base - index * 1000).toISOString() };
  };
  await f.store.upsertDiscoveredDeposits(scope, Array.from({ length: 25 }, (_, index) => operation(index + 1)), () => {});
  const first = await f.store.listHistoryPage(scope, 10);
  assert.equal(first.items.length, 10);
  await f.store.upsertDiscoveredDeposits(scope, [{ ...operation(26), createdAt: new Date(base + 1000).toISOString() }], () => {});
  const second = await f.store.listHistoryPage(scope, 10, first.next);
  const third = await f.store.listHistoryPage(scope, 10, second.next);
  assert.equal(third.next, null);
  assert.deepEqual([...first.items, ...second.items, ...third.items].map(item => item.id),
    Array.from({ length: 25 }, (_, index) => operation(index + 1).id));
});

test('onchain history cursor uses the same order as sorting across mixed IDs at one timestamp', async () => {
  const f = fixture();
  const ids = ['withdraw:a', 'withdraw:B', 'withdraw:z', 'withdraw:A', 'withdraw:10', 'withdraw:2'];
  const records = ids.map(id => ({ id, scope, network, kind: 'withdrawal', address,
    amountSats: 1000, feeSats: 10, state: 'confirmed', createdAt: '2026-09-24T00:00:00.000Z' }));
  f.memory.set(BITCOIN_STORE_KEY, JSON.stringify({ version: 1, records }));
  for (const size of [1, 2, 3]) {
    const observed = [];
    let cursor;
    do {
      const page = await f.store.listHistoryPage(scope, size, cursor);
      observed.push(...page.items.map(item => item.id));
      cursor = page.next;
    } while (cursor);
    assert.deepEqual(observed, [...ids].sort());
    assert.equal(new Set(observed).size, ids.length);
  }
});

test('continued Bitcoin restore checks new provider head before quoting and submission', async () => {
  const f = fixture();
  const cursor = createBitcoinRequestCursor(f.storage);
  const pages = [];
  let newPending = false;
  const remotePending = { id: 'new-pending', typename: 'CoopExitRequest', network,
    feeQuoteId: 'other-quote', status: 'INITIATED', createdAt: '2026-09-24T00:00:00.000Z' };
  f.wallet.getUserRequests = async ({ after }) => {
    const page = after ? Number(after.slice(1)) : 0;
    pages.push(page);
    const settled = Array.from({ length: 50 }, (_, index) => ({ ...remotePending,
      id: `settled-${page}-${index}`, feeQuoteId: `old-${page}-${index}`, status: 'SUCCEEDED' }));
    return { entities: page === 0 && newPending ? [remotePending, ...settled.slice(0, 49)] : settled,
      pageInfo: { hasNextPage: page < 5, endCursor: 'p' + (page + 1) } };
  };
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), false);
  newPending = true;
  const restarted = { ...f.wallet };
  await assert.rejects(prepareBitcoinWithdrawal(restarted, network, address, 1000,
    () => {}, f.store, cursor), /still being checked/);
  assert.equal(f.calls.some(([kind]) => kind === 'quote'), false);
  assert.deepEqual(pages, [0, 1, 2, 3, 4, 5, 0, 0]);
  assert.equal((await f.store.list(scope)).find(row => row.requestId === remotePending.id)?.state, 'pending');

  const fresh = fixture();
  const freshCursor = createBitcoinRequestCursor(fresh.storage);
  let remoteAppeared = false;
  fresh.wallet.getUserRequests = async () => ({
    entities: remoteAppeared ? [remotePending] : [],
    pageInfo: { hasNextPage: false },
  });
  const prepared = await prepareBitcoinWithdrawal(fresh.wallet, network, address, 1000,
    () => {}, fresh.store, freshCursor);
  remoteAppeared = true;
  await assert.rejects(submitBitcoinWithdrawal(fresh.wallet, fresh.store, prepared,
    () => {}, freshCursor), /still being checked/);
  assert.equal(fresh.calls.some(([kind]) => kind === 'withdraw'), false);
});

test('a request inserted while a multi-page head scan runs prevents quote and withdrawal', async () => {
  const f = fixture();
  const cursor = createBitcoinRequestCursor(f.storage);
  const request = (id, status = 'SUCCEEDED') => ({ id, typename: 'CoopExitRequest', network,
    feeQuoteId: `quote-${id}`, status, createdAt: '2026-09-24T00:00:00.000Z' });
  const remote = Array.from({ length: 300 }, (_, index) => request(`old-${index}`));
  f.wallet.getUserRequests = async ({ after }) => {
    const page = after ? Number(after.slice(1)) : 0;
    const entities = remote.slice(page * 50, (page + 1) * 50);
    return { entities, pageInfo: { hasNextPage: (page + 1) * 50 < remote.length,
      endCursor: `p${page + 1}` } };
  };
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), false);
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), true);
  remote.unshift(...Array.from({ length: 250 }, (_, index) => request(`new-${index}`)));
  assert.equal(await recoverBitcoinProviderWithdrawals(f.wallet, f.store, scope, cursor, () => {}), false);
  remote.unshift(request('late-pending', 'INITIATED'));
  await assert.rejects(prepareBitcoinWithdrawal(f.wallet, network, address, 1000,
    () => {}, f.store, cursor), /recovery is still checking|still being checked/);
  assert.equal((await f.store.list(scope)).find(item => item.requestId === 'late-pending')?.state, 'pending');
  assert.equal(f.calls.some(([kind]) => kind === 'quote' || kind === 'withdraw'), false);
});

test('static deposit discovery resumes beyond twenty addresses after process recreation', async () => {
  const addresses = Array.from({ length: 21 }, (_, index) =>
    p2wpkh(secp256k1.getPublicKey(new Uint8Array(32).fill(index + 1)), bitcoinNetwork(network)).address);
  const queried = [];
  const f = fixture({ queryStaticDepositAddresses: async () => addresses,
    getUtxosForDepositAddress: async queriedAddress => {
      queried.push(queriedAddress);
      return queriedAddress === addresses[20] ? [{ txid: '44'.repeat(32), vout: 0 }] : [];
    } });
  for (let poll = 0; poll < 3; poll++) {
    await discoverBitcoinDeposits(f.wallet, createBitcoinStore(f.storage), network, () => {},
      createBitcoinRequestCursor(f.storage), createBitcoinDepositCursor(f.storage));
  }
  assert.deepEqual(queried, addresses);
  assert.equal((await f.store.list(scope)).find(item => item.txid === '44'.repeat(32))?.state, 'action_required');
  assert.equal(await createBitcoinDepositCursor(f.storage).hasPending(scope), false);
});

test('static deposit discovery resumes beyond ten UTXO pages without skipping the last output', async () => {
  const offsets = [];
  const repeated = Array.from({ length: 100 }, (_, vout) => ({ txid: '55'.repeat(32), vout }));
  const f = fixture({ queryStaticDepositAddresses: async () => [address],
    getUtxosForDepositAddress: async (_address, _limit, offset) => {
      offsets.push(offset);
      return offset < 1000 ? repeated : [{ txid: '66'.repeat(32), vout: 0 }];
    } });
  for (let poll = 0; poll < 2; poll++) {
    await discoverBitcoinDeposits(f.wallet, createBitcoinStore(f.storage), network, () => {},
      createBitcoinRequestCursor(f.storage), createBitcoinDepositCursor(f.storage));
  }
  assert.deepEqual(offsets, Array.from({ length: 11 }, (_, page) => page * 100));
  assert.equal((await f.store.list(scope)).find(item => item.txid === '66'.repeat(32))?.state, 'action_required');
  assert.equal(await createBitcoinDepositCursor(f.storage).hasPending(scope), false);
});

test('a completed static-deposit claim beyond twenty provider pages is recovered after restart', async () => {
  const txid = '77'.repeat(32);
  const seen = [];
  const f = fixture({ queryStaticDepositAddresses: async () => [],
    getUserRequests: async ({ after, types }) => {
      assert.deepEqual(types, ['CLAIM_STATIC_DEPOSIT']);
      const page = after ? Number(after.slice(1)) : 0;
      seen.push(page);
      return { entities: page === 24 ? [{ id: 'old-claim', typename: 'ClaimStaticDeposit',
        network, status: 'TRANSFER_COMPLETED', transactionId: txid, outputIndex: 0,
        transferSparkId: 'spark-transfer', creditAmount: amount(900) }] : [],
        pageInfo: { hasNextPage: page < 24, endCursor: `p${page + 1}` } };
    } });
  const operation = { id: `deposit:${network}:${txid}:0`, scope, network, kind: 'deposit', address,
    amountSats: 0, feeSats: null, state: 'checking', txid, vout: 0,
    createdAt: new Date().toISOString() };
  await f.store.update(scope, operation.id, () => operation, () => {});
  for (let poll = 0; poll < 7; poll++) {
    await discoverBitcoinDeposits(f.wallet, createBitcoinStore(f.storage), network, () => {},
      createBitcoinRequestCursor(f.storage), createBitcoinDepositCursor(f.storage));
  }
  assert.deepEqual(seen, Array.from({ length: 25 }, (_, index) => index));
  const [restored] = await f.store.list(scope);
  assert.equal(restored.state, 'confirmed');
  assert.equal(restored.amountSats, 900);
  assert.equal(restored.requestId, 'old-claim');
});
test('claims require exact UTXO quote and approved max fee; accepted transfer is still pending', async () => {
  const f = fixture(); const operation = { id: `deposit:${network}:${'22'.repeat(32)}:0`, scope, network, kind: 'deposit', address, amountSats: 0, feeSats: null,
    state: 'action_required', txid: '22'.repeat(32), vout: 0, createdAt: new Date().toISOString() };
  await f.store.update(scope, operation.id, () => operation, () => {});
  f.wallet.getClaimStaticDepositQuote = async () => ({ transactionId: operation.txid, outputIndex: 0, network, creditAmountSats: 900 });
  f.wallet.claimStaticDepositWithMaxFee = async input => { f.calls.push(['claim', input]); return { transferId: 'transfer-1' }; };
  const offer = await prepareBitcoinDeposit(f.wallet, operation, () => {}, async () => 1000);
  assert.equal(offer.feeSats, 100); assert.equal(offer.creditSats, 900);
  await claimBitcoinDeposit(f.wallet, f.store, offer, () => {});
  assert.equal(f.calls[0][1].maxFee, 100); assert.equal(f.calls[0][1].outputIndex, 0);
  assert.equal((await f.store.list(scope))[0].state, 'pending');
  await assert.rejects(claimBitcoinDeposit(f.wallet, f.store, offer, () => {}), /still being checked/);
  f.wallet.getClaimStaticDepositQuote = async () => ({ transactionId: '33'.repeat(32), outputIndex: 0, network, creditAmountSats: 900 });
  await assert.rejects(prepareBitcoinDeposit(f.wallet, operation, () => {}, async () => 1000), /does not match/);
});
test('claim fee increases require a fresh review, while uncertain claim errors remain blocked after restart', async () => {
  for(const uncertain of [false,true]) {
    const f=fixture();const operation={id:'deposit:test',scope,network,kind:'deposit',address,amountSats:0,feeSats:null,state:'action_required',txid:'22'.repeat(32),vout:0,createdAt:new Date().toISOString()};
    await f.store.update(scope,operation.id,()=>operation,()=>{});
    let calls=0;f.wallet.claimStaticDepositWithMaxFee=async()=>{calls++;const error=Error(uncertain?'Connection interrupted':'Fee larger than max fee');error.getContext=()=>({field:'feeCharged',value:101});throw error};
    const review={operation,grossSats:1000,creditSats:900,feeSats:100,reviewedAt:Date.now()};
    await assert.rejects(claimBitcoinDeposit(f.wallet,f.store,review,()=>{throw Error('locked')}),/locked/);assert.equal(calls,0);
    if(uncertain)await claimBitcoinDeposit(f.wallet,f.store,review,()=>{});
    else await assert.rejects(claimBitcoinDeposit(f.wallet,f.store,review,()=>{}),/fee changed/);
    const restarted=createBitcoinStore(f.storage);assert.equal((await restarted.list(scope))[0].state,uncertain?'checking':'action_required');
    if(uncertain)await assert.rejects(claimBitcoinDeposit(f.wallet,restarted,review,()=>{}),/still being checked/);
    assert.equal(calls,1);
  }
});
test('claim authorization loss before SDK entry restores the actionable deposit', async () => {
  const f = fixture();
  const operation = { id: 'deposit:preclaim', scope, network, kind: 'deposit', address,
    amountSats: 0, feeSats: null, state: 'action_required', txid: '22'.repeat(32), vout: 0,
    createdAt: new Date().toISOString() };
  await f.store.update(scope, operation.id, () => operation, () => {});
  let authorized = true;
  const originalWrite = f.storage.setItem;
  f.storage.setItem = async (key, value) => {
    await originalWrite(key, value);
    if (JSON.parse(value).records[0]?.state === 'checking') authorized = false;
  };
  let calls = 0;
  f.wallet.claimStaticDepositWithMaxFee = async () => { calls++; return { transferId: 'never' }; };
  await assert.rejects(claimBitcoinDeposit(f.wallet, f.store,
    { operation, grossSats: 1000, creditSats: 900, feeSats: 100, reviewedAt: Date.now() },
    () => { if (!authorized) throw new Error('locked'); }), /locked/);
  assert.equal(calls, 0);
  const [record] = await createBitcoinStore(f.storage).list(scope);
  assert.equal(record.state, 'action_required');
  assert.equal(record.amountSats, 0);
  assert.equal(record.feeSats, null);
});
