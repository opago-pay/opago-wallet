import { sats } from './amount';
import { depositAmount } from './chain-data';
import { validateBitcoinAddress, type BitcoinNetwork } from './destination';
import { bitcoinScope, currencySats, listBitcoinRequests, type OnchainWallet } from './onchain';
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
  assertCurrent: () => void): Promise<BitcoinOperation[]> {
  const scope = await bitcoinScope(wallet, network);
  const addresses = await timed(wallet.queryStaticDepositAddresses());
  assertCurrent();
  for (const raw of addresses.slice(0, 20)) {
    const address = validateBitcoinAddress(raw, network);
    for (let page = 0; page < 10; page++) {
      const utxos = await timed(wallet.getUtxosForDepositAddress(address, 100, page * 100, false));
      assertCurrent();
      for (const utxo of utxos) {
        if (!/^[a-f\d]{64}$/i.test(utxo.txid) || !Number.isSafeInteger(utxo.vout) || utxo.vout < 0) throw new Error('Invalid Bitcoin deposit.');
        const txid = utxo.txid.toLowerCase();
        const id = `deposit:${network}:${txid}:${utxo.vout}`;
        await store.update(scope, id, previous => previous ?? ({
          id, scope, network, kind: 'deposit', address, amountSats: 0, feeSats: null,
          txid, vout: utxo.vout, state: 'action_required', createdAt: new Date().toISOString(),
        }), assertCurrent);
      }
      if (utxos.length < 100) break;
    }
  }
  // Recover accepted claims after force-stop, including the submit/persist gap.
  const deposits = (await store.list(scope)).filter(row => row.kind === 'deposit' && row.state !== 'confirmed');
  if (!deposits.length) return store.list(scope);
  const requests = await listBitcoinRequests(wallet);
  for (const record of deposits) {
    assertCurrent();
    const claim = requests.find(item => item.typename === 'ClaimStaticDeposit' &&
      'transactionId' in item && item.transactionId === record.txid && item.outputIndex === record.vout && item.network === network);
    if (claim && 'creditAmount' in claim) {
      // TRANSFER_COMPLETED is the provider's completed transfer evidence. The
      // live SDK balance remains the sole source of available funds.
      const completed = ['TRANSFER_COMPLETED', 'SPEND_TX_CREATED', 'SPEND_TX_BROADCAST'].includes(claim.status);
      await store.update(scope, record.id, previous => ({ ...previous!, requestId: claim.id,
        transferId: claim.transferSparkId, amountSats: currencySats(claim.creditAmount),
        state: completed ? 'confirmed' : 'checking',
      }), assertCurrent);
    } else if (record.transferId) {
      const transfer = await timed(wallet.getTransfer(record.transferId));
      assertCurrent();
      if (transfer?.id === record.transferId && transfer.status === 'TRANSFER_STATUS_COMPLETED') {
        await store.update(scope, record.id, previous => ({ ...previous!, state: 'confirmed' }), assertCurrent);
      }
    }
  }
  return store.list(scope);
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
  assertAuthorized();
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
