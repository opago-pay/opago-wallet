'use strict';

const assert = require('node:assert/strict');
const { ethers } = require('hardhat');

async function fixture() {
  const [payer, merchant, replayPayer] = await ethers.getSigners();
  const checkout = await ethers.deployContract('OpagoHbarCheckout');
  await checkout.waitForDeployment();
  const block = await ethers.provider.getBlock('latest');
  return { checkout, payer, merchant, replayPayer, expires: BigInt(block.timestamp + 600) };
}

const hash = label => ethers.keccak256(ethers.toUtf8Bytes(label));

async function request(checkout, label, merchant, amount, expires) {
  const requestNonce = hash('nonce:' + label);
  const paymentId = await checkout.checkoutPaymentId(
    requestNonce,
    merchant,
    amount,
    expires,
  );
  return { paymentId, requestNonce, merchant, amount, expires };
}

function pay(checkout, signer, item, value = item.amount) {
  return checkout.connect(signer).pay(
    item.paymentId,
    item.requestNonce,
    item.merchant,
    item.amount,
    item.expires,
    { value },
  );
}

describe('OpagoHbarCheckout', function () {
  it('forwards the exact payment and stores a public receipt', async function () {
    const { checkout, payer, merchant, expires } = await fixture();
    const item = await request(checkout, 'correct', merchant.address, 12_345_678n, expires);
    const before = await ethers.provider.getBalance(merchant.address);
    const receipt = await (await pay(checkout, payer, item)).wait();

    assert.equal(await ethers.provider.getBalance(merchant.address), before + item.amount);
    assert.equal(await checkout.isPaymentProcessed(item.paymentId), true);
    assert.equal(await checkout.paymentCount(), 1n);
    assert.equal(await checkout.totalTinybarVolume(), item.amount);
    const record = await checkout.payment(item.paymentId);
    assert.equal(record.payer, payer.address);
    assert.equal(record.merchant, merchant.address);
    assert.equal(record.amountTinybar, item.amount);
    assert.equal(record.requestNonce, item.requestNonce);
    const event = receipt.logs.map(log => {
      try { return checkout.interface.parseLog(log); } catch { return null; }
    }).find(log => log?.name === 'PaymentSettled');
    assert.equal(event.args.paymentId, item.paymentId);
    assert.equal(event.args.requestNonce, item.requestNonce);
  });

  it('rejects a wrong amount', async function () {
    const { checkout, payer, merchant, expires } = await fixture();
    const item = await request(checkout, 'wrong', merchant.address, 100n, expires);
    await assert.rejects(pay(checkout, payer, item, 99n), /IncorrectAmount/);
  });

  it('rejects an expired payment', async function () {
    const { checkout, payer, merchant } = await fixture();
    const block = await ethers.provider.getBlock('latest');
    const item = await request(checkout, 'expired', merchant.address, 1n, block.timestamp);
    await assert.rejects(pay(checkout, payer, item), /CheckoutExpired/);
  });

  it('rejects a duplicate paymentId without changing the original record', async function () {
    const { checkout, payer, merchant, expires } = await fixture();
    const item = await request(checkout, 'duplicate', merchant.address, 1n, expires);
    await (await pay(checkout, payer, item)).wait();
    const original = await checkout.payment(item.paymentId);
    await assert.rejects(pay(checkout, payer, item), /PaymentAlreadyProcessed/);
    const after = await checkout.payment(item.paymentId);
    assert.deepEqual(Array.from(after), Array.from(original));
    assert.equal(await checkout.paymentCount(), 1n);
  });

  it('rejects a replay by another payer', async function () {
    const { checkout, payer, merchant, replayPayer, expires } = await fixture();
    const item = await request(checkout, 'replay', merchant.address, 1n, expires);
    await (await pay(checkout, payer, item)).wait();
    await assert.rejects(pay(checkout, replayPayer, item), /PaymentAlreadyProcessed/);
  });

  it('cryptographically binds paymentId to nonce, contract, merchant, amount, and expiry', async function () {
    const { checkout, payer, merchant, replayPayer, expires } = await fixture();
    const item = await request(checkout, 'bound', merchant.address, 10n, expires);
    const changedNonce = { ...item, requestNonce: hash('different-nonce') };
    const changedMerchant = { ...item, merchant: replayPayer.address };
    const changedAmount = { ...item, amount: 11n };
    const changedExpiry = { ...item, expires: expires + 1n };

    await assert.rejects(pay(checkout, payer, changedNonce), /PaymentIdMismatch/);
    await assert.rejects(pay(checkout, payer, changedMerchant), /PaymentIdMismatch/);
    await assert.rejects(pay(checkout, payer, changedAmount), /PaymentIdMismatch/);
    await assert.rejects(pay(checkout, payer, changedExpiry), /PaymentIdMismatch/);
  });

  it('rejects invalid payment identifiers, amounts, and merchants', async function () {
    const { checkout, payer, merchant, expires } = await fixture();
    const zero = ethers.ZeroHash;
    await assert.rejects(
      checkout.pay(zero, hash('nonce'), merchant.address, 1n, expires, { value: 1n }),
      /InvalidPaymentId/,
    );

    const zeroAmount = await request(checkout, 'zero-amount', merchant.address, 0n, expires);
    await assert.rejects(pay(checkout, payer, zeroAmount, 0n), /InvalidAmount/);

    for (const invalidMerchant of [
      ethers.ZeroAddress,
      payer.address,
      await checkout.getAddress(),
    ]) {
      const item = await request(checkout, 'invalid:' + invalidMerchant, invalidMerchant, 1n, expires);
      await assert.rejects(pay(checkout, payer, item), /InvalidMerchant/);
    }
  });

  it('reverts all state when forwarding fails', async function () {
    const { checkout, payer, expires } = await fixture();
    const merchant = await ethers.deployContract('RevertingMerchant');
    await merchant.waitForDeployment();
    const item = await request(
      checkout,
      'failed-forward',
      await merchant.getAddress(),
      7n,
      expires,
    );
    await assert.rejects(pay(checkout, payer, item), /ForwardingFailed/);
    assert.equal(await checkout.isPaymentProcessed(item.paymentId), false);
    assert.equal(await checkout.paymentCount(), 0n);
    assert.equal(await checkout.totalTinybarVolume(), 0n);
    assert.equal(await ethers.provider.getBalance(await checkout.getAddress()), 0n);
  });

  it('blocks reentrant calls while still completing the outer payment', async function () {
    const { checkout, payer, merchant, expires } = await fixture();
    const reentrant = await ethers.deployContract('ReentrantMerchant');
    await reentrant.waitForDeployment();
    const innerCall = checkout.interface.encodeFunctionData('pay', [
      hash('inner-id'),
      hash('inner-nonce'),
      merchant.address,
      1n,
      expires,
    ]);
    await (await reentrant.configure(await checkout.getAddress(), innerCall)).wait();
    const item = await request(
      checkout,
      'reentrant',
      await reentrant.getAddress(),
      5n,
      expires,
    );

    await (await pay(checkout, payer, item)).wait();
    assert.equal(await reentrant.attempted(), true);
    assert.equal(
      await reentrant.observedError(),
      checkout.interface.getError('ReentrantCall').selector,
    );
    assert.equal(await checkout.isPaymentProcessed(item.paymentId), true);
    assert.equal(await checkout.paymentCount(), 1n);
  });
});