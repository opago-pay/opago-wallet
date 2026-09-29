import { sats } from './amount';
import { depositAmount } from './chain-data';
import { validateBitcoinAddress, type BitcoinNetwork } from './destination';
import { bitcoinScope, currencySats, listBitcoinRequests, scanBitcoinRequestPages, type ClaimStaticDeposit, type OnchainWallet } from './onchain';
import type { BitcoinRequestCursor } from './request-cursor';
import type { BitcoinDepositCursor } from './deposit-cursor';
import type { BitcoinOperation, BitcoinStore } from './store';
import { withTimeout } from '../promise-timeout';

const timed = <T>(promise: Promise<T>) => withTimeout(promise, 15_000, 'Bitcoin deposit lookup timed out.');
export interface BitcoinDepositQuote {
  operation: BitcoinOperation;
  grossSats: number;
  creditSats: number;
  feeSats: number;
  reviewedAt: number;
}

/** Confirmed-only endpoint. A static address is general wallet incoming,
 * deliberately NEVER matched to an invoice by its amount or creation time. */
export async function discoverBitcoinDeposits(wallet: OnchainWallet, store: BitcoinStore, network: BitcoinNetwork,
  assertCurrent: () => void, cursor?: BitcoinRequestCursor, depositCursor?: BitcoinDepositCursor): Promise<BitcoinOperation[]> {
  const scope = await bitcoinScope(wallet, network);
  const addresses = await timed(wallet.queryStaticDepositAddresses());
  assertCurrent();
  if (addresses.length > 10_000) throw new Error('Bitcoin deposit discovery is incomplete: too many addresses.');
  const checkedAddresses = addresses.map(raw => validateBitcoinAddress(raw, network));
  const indexOutputs = async (address: string, utxos: Awaited<ReturnType<OnchainWallet['getUtxosForDepositAddress']>>) => {
    const candidates: BitcoinOperation[] = [];
    const pageIds = new Set<string>();
    for (const utxo of utxos) {
      if (!/^[a-f\d]{64}$/i.test(utxo.txid) || !Number.isSafeInteger(utxo.vout) || utxo.vout < 0) throw new Error('Invalid Bitcoin deposit.');
      const txid = utxo.txid.toLowerCase();
      const id = `deposit:${network}:${txid}:${utxo.vout}`;
      if (pageIds.has(id)) continue;
      candidates.push({
        id, scope, network, kind: 'deposit', address, amountSats: 0, feeSats: null,
        txid, vout: utxo.vout, state: 'action_required', createdAt: new Date().toISOString(),
      });
      pageIds.add(id);
    }
    const existing = new Set(await store.existingIds(scope, [...pageIds]));
    await store.upsertDiscoveredDeposits(scope, candidates.filter(item => !existing.has(item.id)), assertCurrent);
  };
  if (depositCursor) {
    await depositCursor.run(scope, checkedAddresses, async (start, advance) => {
      if (!checkedAddresses.length) { await advance(null); return; }
      let { addressIndex, offset } = start;
      for (let page = 0; page < 10 && addressIndex < checkedAddresses.length; page++) {
        const address = checkedAddresses[addressIndex];
        const utxos = await timed(wallet.getUtxosForDepositAddress(address, 100, offset, false));
        assertCurrent();
        await indexOutputs(address, utxos);
        assertCurrent();
        if (utxos.length < 100) { addressIndex += 1; offset = 0; }
        else offset += 100;
        await advance(addressIndex === checkedAddresses.length ? null : {
          addressCount: checkedAddresses.length, addressIndex, offset, anchor: checkedAddresses[addressIndex],
        });
      }
    });
  } else for (const address of checkedAddresses) {
    for (let page = 0; page < 10; page++) {
      const utxos = await timed(wallet.getUtxosForDepositAddress(address, 100, page * 100, false));
      assertCurrent();
      await indexOutputs(address, utxos);
      if (utxos.length < 100) break;
      if (page === 9) throw new Error('Bitcoin deposit discovery is incomplete: too many outputs.');
    }
  }
  // Recover accepted claims after force-stop, including the submit/persist gap.
  const deposits = (await store.listActive(scope)).filter(row => row.kind === 'deposit');
  if (!deposits.length) return store.listActive(scope);
  const applyClaim = async (record: BitcoinOperation, claim: ClaimStaticDeposit) => {
    // TRANSFER_COMPLETED is the provider's completed transfer evidence. The
    // live SDK balance remains the sole source of available funds.
    const completed = ['TRANSFER_COMPLETED', 'SPEND_TX_CREATED', 'SPEND_TX_BROADCAST'].includes(claim.status);
    await store.update(scope, record.id, previous => ({ ...previous!, requestId: claim.id,
      transferId: claim.transferSparkId, amountSats: currencySats(claim.creditAmount),
      state: completed ? 'confirmed' : 'checking',
    }), assertCurrent);
  };
  let requests: Awaited<ReturnType<typeof listBitcoinRequests>> = [];
  if (cursor) {
    await scanBitcoinRequestPages(wallet, cursor, scope, 'deposit', async page => {
      for (const record of deposits) {
        const claim = page.find(item => item.typename === 'ClaimStaticDeposit' &&
          'transactionId' in item && item.transactionId === record.txid && item.outputIndex === record.vout && item.network === network);
        if (claim) await applyClaim(record, claim as ClaimStaticDeposit);
      }
    }, assertCurrent);
  } else requests = await listBitcoinRequests(wallet);
  for (const record of deposits) {
    assertCurrent();
    const claim = !cursor && requests.find(item => item.typename === 'ClaimStaticDeposit' &&
      'transactionId' in item && item.transactionId === record.txid && item.outputIndex === record.vout && item.network === network);
    if (claim && 'creditAmount' in claim) await applyClaim(record, claim as ClaimStaticDeposit);
    else if (record.transferId) {
      const transfer = await timed(wallet.getTransfer(record.transferId));
      assertCurrent();
      if (transfer?.id === record.transferId && transfer.status === 'TRANSFER_STATUS_COMPLETED') {
        await store.update(scope, record.id, previous => ({ ...previous!, state: 'confirmed' }), assertCurrent);
      }
    }
  }
  return store.listActive(scope);
}

export async function prepareBitcoinDeposit(wallet: OnchainWallet, operation: BitcoinOperation,
  assertCurrent: () => void, readAmount = depositAmount): Promise<BitcoinDepositQuote> {
  if (operation.kind !== 'deposit' || !operation.txid || operation.vout === undefined || operation.state !== 'action_required') {
    throw new Error('This Bitcoin deposit is still being checked.');
  }
  if (operation.scope !== await bitcoinScope(wallet, operation.network)) throw new Error('Wallet changed.');
  const grossSats = await readAmount(operation.network, operation.txid, operation.vout, operation.address);
  assertCurrent();
  const quote = await timed(wallet.getClaimStaticDepositQuote(operation.txid, operation.vout));
  assertCurrent();
  if (quote.transactionId.toLowerCase() !== operation.txid || quote.outputIndex !== operation.vout || quote.network !== operation.network) {
    throw new Error('Bitcoin deposit quote does not match this deposit.');
  }
  const creditSats = sats(quote.creditAmountSats);
  if (creditSats <= 0 || creditSats > grossSats) throw new Error('Bitcoin deposit is too small for the current fee.');
  return Object.freeze({ operation: { ...operation }, grossSats, creditSats, feeSats: grossSats - creditSats, reviewedAt: Date.now() });
}

export async function claimBitcoinDeposit(wallet: OnchainWallet, store: BitcoinStore, reviewed: BitcoinDepositQuote,
  assertAuthorized: () => void): Promise<void> {
  const { operation: original, feeSats, creditSats } = reviewed;
  const operation = { ...original };
  if (Date.now() - reviewed.reviewedAt > 60_000) throw new Error('The Bitcoin fee quote expired. Review this payment again.');
  if (operation.scope !== await bitcoinScope(wallet, operation.network)) throw new Error('Wallet changed.');
  assertAuthorized();
  await store.update(operation.scope, operation.id, previous => {
    if (!previous || previous.state !== 'action_required') throw new Error('This Bitcoin deposit is still being checked.');
    return { ...previous, state: 'checking', feeSats, amountSats: creditSats };
  }, assertAuthorized);
  try {
    assertAuthorized();
  } catch (cause) {
    await store.abortBeforeSubmission(operation.scope, operation.id, 'checking');
    throw cause;
  }
  try {
    const result = await withTimeout(wallet.claimStaticDepositWithMaxFee({
      transactionId: operation.txid!, outputIndex: operation.vout!, maxFee: feeSats,
    }), 45_000, 'Bitcoin deposit claim timed out.');
    assertAuthorized();
    if (result?.transferId) await store.update(operation.scope, operation.id,
      previous => ({ ...previous!, transferId: result.transferId, state: 'pending' }), assertAuthorized);
  } catch (cause) {
    // Only this local pinned-SDK validation is proven before signature/submission.
    const error = cause as Error & { getContext?: () => { field?: string; value?: unknown } };
    if (error instanceof Error && /^Fee larger than max fee(?: \[|$)/.test(error.message) &&
        error.getContext?.().field === 'feeCharged' && Number(error.getContext?.().value) > feeSats) {
      await store.update(operation.scope, operation.id, previous => ({ ...previous!, state: 'action_required' }), assertAuthorized);
      throw new Error('The Bitcoin fee changed. Review the deposit again.');
    }
    // Never offer another claim based on a timeout. Reconcile the UTXO instead.
  }
}
