'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { SparkWallet } = require('@buildonspark/spark-sdk');
require('./register-typescript.cjs');
const { selectExactLeaves, selectSwapLeaves, installSparkLeafSelection } = require('../lib/spark-leaf-selection.ts');
const leaves = values => values.map((value, i) => ({ id: 'synthetic-' + i, value }));
const sum = selected => selected.reduce((total, leaf) => total + leaf.value, 0);

test('finds exact combinations the SDK greedy selection misses, without changing leaf objects', () => {
  const input = leaves([8, 7, 6]);
  const exact = selectExactLeaves(input, 13);
  assert.deepEqual(exact.map(leaf => leaf.value).sort((a, b) => a - b), [6, 7]);
  assert.ok(exact.every(leaf => input.includes(leaf)));
  assert.deepEqual(input.map(leaf => leaf.value), [8, 7, 6]);
  assert.deepEqual(selectExactLeaves(leaves([8, 6, 6, 2, 2]), 12).map(leaf => leaf.value), [6, 6]);
});

test('exact and necessary-swap selections minimize inputs against exhaustive small-wallet cases', () => {
  for (let seed = 1; seed <= 35; seed++) {
    const input = leaves(Array.from({ length: 8 }, (_, i) => 1 + ((seed * (i + 3) * 17 + i * i) % 23)));
    const combinations = Array.from({ length: 255 }, (_, n) => input.filter((_, i) => (n + 1) & (1 << i)));
    for (let amount = 1; amount <= 35; amount++) {
      const exact = selectExactLeaves(input, amount);
      const best = combinations.filter(choice => sum(choice) === amount).sort((a, b) => a.length - b.length)[0];
      assert.equal(exact?.length ?? null, best?.length ?? null);
      if (exact) {
        assert.equal(sum(exact), amount);
        assert.equal(new Set(exact.map(leaf => leaf.id)).size, exact.length);
      }
      const swap = selectSwapLeaves(input, amount);
      const least = combinations.filter(choice => sum(choice) >= amount).sort((a, b) => a.length - b.length)[0];
      assert.equal(swap?.length ?? null, least?.length ?? null);
    }
  }
});

test('necessary swaps prefer one covering leaf instead of many small signing inputs', () => {
  const input = leaves([1, 2, 3, 4, 5, 20, 40]);
  assert.deepEqual(selectSwapLeaves(input, 12), [input[5]]);
  assert.deepEqual(selectSwapLeaves(input, 45), [input[6], input[5]]);
  assert.equal(selectSwapLeaves(input, 100), null);
});

test('invalid/duplicate/oversized sets safely defer to the pinned SDK', () => {
  for (const input of [leaves([0, 1]), leaves([-1]), leaves([0.5]), leaves([NaN]), leaves([Infinity]),
    [{ id: 'same', value: 2 }, { id: 'same', value: 3 }], leaves(Array(257).fill(1))]) {
    assert.equal(selectExactLeaves(input, 3), null);
    assert.equal(selectSwapLeaves(input, 3), null);
  }
  for (const amount of [0, -1, 1.2, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
    assert.equal(selectExactLeaves(leaves([2]), amount), null);
    assert.equal(selectSwapLeaves(leaves([2]), amount), null);
  }
  // A difficult large search remains bounded and never returns a wrong sum.
  const input = leaves(Array.from({ length: 200 }, (_, i) => i * 100003 + 700001));
  const exact = selectExactLeaves(input, 43212345);
  if (exact) assert.equal(sum(exact), 43212345);
});

async function managerFixture(values) {
  const wallet = new SparkWallet({ network: 'MAINNET' }); // no init/seed/network
  const manager = wallet.leafManager;
  await manager.addLeaves(leaves(values));
  return { manager, wallet };
}

test('actual SDK reserves exact inputs under its existing lock and excludes unavailable funds', async () => {
  const { manager } = await managerFixture([8, 7, 6]);
  assert.equal(manager.selectLeaves([13])[1], false); // reproduces the SDK's missed exact fit
  installSparkLeafSelection(manager);
  const selectMethod = manager.selectLeaves;
  installSparkLeafSelection(manager);
  assert.equal(manager.selectLeaves, selectMethod);
  const selected = await manager.selectLeavesWithSwap([13]);
  assert.equal(sum(selected[0]), 13);
  for (const leaf of selected[0]) assert.equal(manager.leaves.get(leaf.id).status, 'LOCAL_LOCKED');
  assert.equal(manager.getAvailableBalance(), 8);
  assert.equal(manager.selectLeaves([13])[1], false);
  await manager.addIncomingLeaves([{ id: 'incoming-synthetic', value: 13 }], 'synthetic-incoming');
  assert.equal(manager.selectLeaves([13])[1], false);
});

test('actual SDK retains swap pending, recovery and post-swap locking with fewer inputs', async () => {
  const { manager } = await managerFixture([1, 2, 3, 4, 20]);
  installSparkLeafSelection(manager);
  let captured;
  manager.swapService.requestLeavesSwap = async input => {
    captured = input.leaves;
    assert.equal(captured.length, 1);
    assert.equal(captured[0].value, 20);
    assert.equal(manager.leaves.get(captured[0].id).status, 'LOCAL_LOCKED');
    input.registerSwapTransferId('synthetic-swap');
    await input.onSwapInitiated();
    assert.equal(manager.leaves.get(captured[0].id).status, 'SWAP_PENDING');
    return [{ id: 'synthetic-exact', value: 12 }, { id: 'synthetic-change', value: 8 }];
  };
  const selected = await manager.selectLeavesWithSwap([12]);
  assert.equal(sum(selected[0]), 12);
  // The pinned SDK removes SPENT leaves from its live state map.
  assert.equal(manager.leaves.has(captured[0].id), false);
  assert.equal(manager.leaves.get('synthetic-exact').status, 'LOCAL_LOCKED');
  assert.equal(manager.leaves.get('synthetic-change').status, 'AVAILABLE');
});

test('actual SDK does not release possibly submitted swap inputs on failure', async () => {
  for (const submitted of [false, true]) {
    const { manager } = await managerFixture([1, 2, 20]);
    installSparkLeafSelection(manager);
    manager.swapService.requestLeavesSwap = async input => {
      if (submitted) { input.registerSwapTransferId('synthetic-swap'); await input.onSwapInitiated(); }
      throw new Error('Synthetic swap failure');
    };
    await assert.rejects(manager.selectLeavesWithSwap([12]), /Synthetic swap failure/);
    assert.equal(manager.leaves.get('synthetic-2').status, submitted ? 'SWAP_PENDING' : 'AVAILABLE');
  }
});

test('multiple targets retain SDK allocation and concurrent selections cannot reuse a leaf', async () => {
  const { manager } = await managerFixture([8, 7, 6]);
  const multi = manager.selectLeaves([7, 8]);
  installSparkLeafSelection(manager);
  assert.deepEqual(manager.selectLeaves([7, 8]), multi);
  let swaps = 0;
  manager.swapService.requestLeavesSwap = async () => { swaps++; throw Error('No synthetic liquidity'); };
  const results = await Promise.allSettled([manager.selectLeavesWithSwap([13]), manager.selectLeavesWithSwap([13])]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(swaps, 0); // second request fails before a network operation
});
