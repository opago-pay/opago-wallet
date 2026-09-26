import type { SparkWallet } from '@buildonspark/spark-sdk';
import { Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { readBitcoinBalance, sats } from './amount';
import { bitcoinNetwork, validateBitcoinAddress, type BitcoinNetwork } from './destination';
import { withTimeout } from '../promise-timeout';
import type { BitcoinRequestCursor } from './request-cursor';
import type { BitcoinOperation, BitcoinStore, ProviderWithdrawalMerge } from './store';

type CoopExitRequest = NonNullable<Awaited<ReturnType<SparkWallet['getCoopExitRequest']>>>;
type CoopExitFeeQuote = NonNullable<Awaited<ReturnType<SparkWallet['getWithdrawalFeeQuote']>>>;
type RequestKinds = NonNullable<Parameters<SparkWallet['getUserRequests']>[0]>['types'];
export interface ClaimStaticDeposit {
  id: string; typename: 'ClaimStaticDeposit'; network: string; status: string;
  transactionId: string; outputIndex: number; transferSparkId?: string;
  creditAmount: { originalUnit: string; originalValue: number };
}
const timed = <T>(promise: Promise<T>, ms: number) => withTimeout(promise, ms, 'Bitcoin network request timed out.');

export type OnchainWallet = Pick<SparkWallet, 'getBalance' | 'getIdentityPublicKey' | 'getWithdrawalFeeQuote' |
  'withdraw' | 'getCoopExitRequest' | 'getUserRequests' | 'getStaticDepositAddress' | 'queryStaticDepositAddresses' |
  'getUtxosForDepositAddress' | 'getClaimStaticDepositQuote' | 'claimStaticDepositWithMaxFee' | 'getTransfer' | 'getTransfers' | 'getLightningReceiveRequest'>;
export interface PreparedBitcoinWithdrawal {
  asset: 'bitcoin'; route: 'onchain'; network: BitcoinNetwork; scope: string;
  address: string; amountSats: number; feeSats: number; networkFeeSats: number; serviceFeeSats: number;
  totalSats: number; quoteId: string; expiresAt: number;
}
const scopes = new WeakMap<object, Promise<string>>();
// A UI timeout cannot cancel SDK signing. Retain this guard until the actual
// quote settles, including after navigation and a new preparation attempt.
const quoteTasks = new WeakMap<object, Promise<unknown>>();
export async function bitcoinScope(wallet: Pick<OnchainWallet, 'getIdentityPublicKey'>, network: BitcoinNetwork): Promise<string> {
  let identity = scopes.get(wallet);
  if (!identity) {
    identity = wallet.getIdentityPublicKey().then(value => {
      if (!/^[a-f\d]{66}$/i.test(value)) throw new Error('Bitcoin wallet identity is unavailable.');
      return value.toLowerCase();
    });
    scopes.set(wallet, identity);
    identity.catch(() => scopes.delete(wallet));
  }
  return `${network}:${await identity}`;
}
export function currencySats(value: { originalUnit: string; originalValue: number }): number {
  if (value.originalUnit !== 'SATOSHI') throw new Error('Invalid Bitcoin fee quote.');
  return sats(value.originalValue);
}
function validateQuote(quote: CoopExitFeeQuote | null, network: BitcoinNetwork) {
  if (!quote?.id || quote.network !== network || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= Date.now()) {
    throw new Error('The Bitcoin fee quote expired. Review this payment again.');
  }
  const networkFeeSats = currencySats(quote.l1BroadcastFeeMedium);
  const serviceFeeSats = currencySats(quote.userFeeMedium);
  const feeSats = sats(networkFeeSats + serviceFeeSats);
  if (!feeSats) throw new Error('Invalid Bitcoin fee quote.');
  return { networkFeeSats, serviceFeeSats, feeSats, quoteId: quote.id, expiresAt: Date.parse(quote.expiresAt) };
}

/** SDK 0.7.12 may sign an internal leaf swap while quoting. Explicit preparation
 * authorization is mandatory; never invoke from scan/paste or startup. */
export async function prepareBitcoinWithdrawal(wallet: OnchainWallet, network: BitcoinNetwork, address: string,
  amountSats: number, assertAuthorized: () => void, store?: BitcoinStore,
  cursor?: BitcoinRequestCursor): Promise<PreparedBitcoinWithdrawal> {
  address = validateBitcoinAddress(address, network);
  if (sats(amountSats) <= 0) throw new Error('Enter a positive amount.');
  const scope = await bitcoinScope(wallet, network);
  assertAuthorized();
  if (store && cursor) {
    const complete = await recoverBitcoinProviderWithdrawals(wallet, store, scope, cursor, assertAuthorized);
    assertAuthorized();
    if (!complete) throw new Error('Bitcoin payment recovery is still checking older requests. Try again shortly.');
    if ((await store.listActive(scope)).some(item => item.kind === 'withdrawal' &&
        !['confirmed', 'failed', 'aborted'].includes(item.state))) {
      throw new Error('A Bitcoin payment is still being checked. Do not send it again.');
    }
  }
  const balance = readBitcoinBalance(await timed(wallet.getBalance(), 15_000)).available;
  assertAuthorized();
  if (amountSats >= balance) throw new Error('Insufficient Bitcoin balance for amount and fee.');
  if (quoteTasks.has(wallet)) throw new Error('A Bitcoin payment is still being checked. Do not send it again.');
  const task = wallet.getWithdrawalFeeQuote({ amountSats, withdrawalAddress: address });
  quoteTasks.set(wallet, task);
  void task.finally(() => { if (quoteTasks.get(wallet) === task) quoteTasks.delete(wallet); }).catch(() => undefined);
  const quote = await timed(task, 30_000);
  assertAuthorized();
  const fees = validateQuote(quote, network);
  if (currencySats(quote!.totalAmount) !== amountSats) throw new Error('Invalid Bitcoin fee quote.');
  const totalSats = sats(amountSats + fees.feeSats);
  if (totalSats > balance) throw new Error('Insufficient Bitcoin balance for amount and fee.');
  return Object.freeze({ asset: 'bitcoin', route: 'onchain', network, scope, address, amountSats, totalSats, ...fees });
}

export async function submitBitcoinWithdrawal(wallet: OnchainWallet, store: BitcoinStore, payment: PreparedBitcoinWithdrawal,
  assertAuthorized: () => void, cursor?: BitcoinRequestCursor): Promise<BitcoinOperation> {
  // Snapshot every authorized field; presentation edits cannot mutate this call.
  const approved = { ...payment };
  assertAuthorized();
  if (approved.scope !== await bitcoinScope(wallet, approved.network)) throw new Error('Wallet changed.');
  assertAuthorized();
  if (cursor) {
    const complete = await recoverBitcoinProviderWithdrawals(wallet, store, approved.scope, cursor, assertAuthorized);
    assertAuthorized();
    if (!complete || (await store.listActive(approved.scope)).some(item => item.kind === 'withdrawal' &&
        !['confirmed', 'failed', 'aborted'].includes(item.state))) {
      throw new Error('A Bitcoin payment is still being checked. Do not send it again.');
    }
  }
  if (approved.expiresAt <= Date.now()) throw new Error('The Bitcoin fee quote expired. Review this payment again.');
  const balance = readBitcoinBalance(await timed(wallet.getBalance(), 15_000)).available;
  assertAuthorized();
  if (approved.expiresAt <= Date.now()) throw new Error('The Bitcoin fee quote expired. Review this payment again.');
  if (sats(approved.amountSats + approved.feeSats) !== approved.totalSats || approved.totalSats > balance) {
    throw new Error('Insufficient Bitcoin balance for amount and fee.');
  }
  const operation: BitcoinOperation = {
    id: `withdraw:${approved.quoteId}`, scope: approved.scope, network: approved.network, kind: 'withdrawal',
    address: approved.address, amountSats: approved.amountSats, feeSats: approved.feeSats,
    quoteId: approved.quoteId, state: 'prepared', createdAt: new Date().toISOString(),
  };
  await store.begin(operation, assertAuthorized);
  // Once this marker is durable, any interruption is ambiguous, including the
  // gap before SDK entry. SDK withdraw has NO client idempotency parameter.
  try {
    await store.update(operation.scope, operation.id, old => {
      if (old?.state !== 'prepared') throw new Error('This Bitcoin payment was already submitted or cancelled.');
      return { ...old, state: 'checking' };
    }, assertAuthorized);
  } catch (cause) {
    // The SDK is not entered while a reservation is still only prepared.
    await store.abortBeforeSubmission(operation.scope, operation.id, 'prepared');
    throw cause;
  }
  try {
    assertAuthorized();
    if (approved.expiresAt <= Date.now()) throw new Error('The Bitcoin fee quote expired. Review this payment again.');
  } catch (cause) {
    // No SDK call has begun. A failed write leaves checking in place rather than
    // risking a second payment; the next reconciliation can investigate it.
    await store.abortBeforeSubmission(operation.scope, operation.id, 'checking');
    throw cause;
  }
  try {
    const request = await timed(wallet.withdraw({
      onchainAddress: approved.address, amountSats: approved.amountSats,
      feeQuoteId: approved.quoteId, feeAmountSats: approved.feeSats,
      exitSpeed: 'MEDIUM' as Parameters<OnchainWallet['withdraw']>[0]['exitSpeed'],
      deductFeeFromWithdrawalAmount: false,
    }), 45_000);
    assertAuthorized();
    if (request?.id && request.feeQuoteId === approved.quoteId && request.network === approved.network) {
      return await store.update(operation.scope, operation.id, previous => ({ ...previous!, ...withdrawalResolution(previous!, request) }), assertAuthorized);
    }
  } catch { /* May have submitted. Persisted record blocks resubmission. */ }
  return { ...operation, state: 'checking' };
}

export function withdrawalResolution(record: BitcoinOperation, request: CoopExitRequest): Partial<BitcoinOperation> {
  if (request.network !== record.network || request.feeQuoteId !== record.quoteId || (record.requestId && request.id !== record.requestId)) return {};
  if (record.recoveredFromProvider) {
    // The provider does not expose an unambiguous recipient/amount for a
    // restored operation. Show its authoritative status, never guess outputs.
    return { requestId: request.id, state: request.status === 'SUCCEEDED' ? 'confirmed' :
      ['FAILED', 'EXPIRED'].includes(request.status) ? 'failed' :
        ['TX_BROADCASTED', 'WAITING_ON_TX_CONFIRMATIONS'].includes(request.status) ? 'broadcast' : 'pending' };
  }
  if (request.status === 'FAILED' || request.status === 'EXPIRED') {
    return { requestId: request.id, state: 'failed' };
  }
  const base: Partial<BitcoinOperation> = { requestId: request.id, state: 'pending' };
  try {
    const tx = Transaction.fromRaw(hex.decode(request.rawCoopExitTransaction), { allowUnknownOutputs: true });
    let recipient = 0n;
    for (let index = 0; index < tx.outputsLength; index++) {
      if (tx.getOutputAddress(index, bitcoinNetwork(record.network)) === record.address) recipient += tx.getOutput(index).amount ?? 0n;
    }
    const chargedFeeSats = currencySats(request.fee) + currencySats(request.l1BroadcastFee);
    if (recipient !== BigInt(record.amountSats) || chargedFeeSats > record.feeSats!) return base;
    base.txid = tx.id;
    if (request.status === 'SUCCEEDED') {
      base.state = 'confirmed';
      base.actualFeeSats = chargedFeeSats;
    }
    else if (['TX_BROADCASTED', 'WAITING_ON_TX_CONFIRMATIONS'].includes(request.status)) base.state = 'broadcast';
  } catch { /* No valid transaction evidence yet. */ }
  return base;
}

export async function listBitcoinRequests(wallet: OnchainWallet) {
  const requests: (CoopExitRequest | ClaimStaticDeposit)[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = await timed(wallet.getUserRequests({ first: 50, after,
      types: ['COOP_EXIT', 'CLAIM_STATIC_DEPOSIT'] as RequestKinds,
    }), 12_000);
    if (!result) throw new Error('Bitcoin provider history is unavailable.');
    for (const item of result.entities) {
      if (item.typename === 'CoopExitRequest' || item.typename === 'ClaimStaticDeposit') requests.push(item as CoopExitRequest | ClaimStaticDeposit);
    }
    if (!result.pageInfo.hasNextPage) break;
    if (page === 19) throw new Error('Bitcoin provider history is incomplete; continue recovery before treating a missing request as absent.');
    const cursor = result.pageInfo.endCursor;
    if (!cursor || cursor === after) throw new Error('Bitcoin provider history cursor is invalid.');
    after = cursor;
  }
  return requests;
}

/** Continue a provider search over multiple polls and process each page before
 * advancing its durable cursor. An incomplete scan never proves absence. */
export function scanBitcoinRequestPages(wallet: OnchainWallet, cursor: BitcoinRequestCursor,
  scope: string, kind: 'withdrawal' | 'withdrawal-head' | 'withdrawal-lookup' | 'deposit',
  onPage: (requests: (CoopExitRequest | ClaimStaticDeposit)[]) => Promise<void | boolean>,
  assertCurrent: () => void, pageBudget = 4): Promise<boolean> {
  if (!Number.isSafeInteger(pageBudget) || pageBudget < 1 || pageBudget > 20) {
    throw new Error('Invalid Bitcoin provider page budget.');
  }
  return cursor.run(scope, kind, async (initialAfter, advance) => {
    let after = initialAfter;
    for (let page = 0; page < pageBudget; page++) {
      assertCurrent();
      const result = await timed(wallet.getUserRequests({ first: 50, after,
        types: [kind === 'deposit' ? 'CLAIM_STATIC_DEPOSIT' : 'COOP_EXIT'] as RequestKinds,
      }), 12_000);
      assertCurrent();
      if (!result || !Array.isArray(result.entities) || !result.pageInfo) {
        throw new Error('Bitcoin provider history is unavailable.');
      }
      const expectedType = kind === 'deposit' ? 'ClaimStaticDeposit' : 'CoopExitRequest';
      const stop = await onPage(result.entities.filter(item => item.typename === expectedType) as (CoopExitRequest | ClaimStaticDeposit)[]);
      assertCurrent();
      if (stop === true || !result.pageInfo.hasNextPage) { await advance(null); return true; }
      const next = result.pageInfo.endCursor;
      if (!next || next === after) throw new Error('Bitcoin provider history cursor is invalid.');
      await advance(next);
      after = next;
    }
    return false;
  });
}

/** Recover the existence and status of old withdrawals after seed restore.
 * Spark's user-request index is bound to the authenticated wallet, but the
 * response lacks a trustworthy recipient/amount pair. Those fields remain
 * unknown rather than being inferred from ambiguous transaction outputs. */
export async function recoverBitcoinProviderWithdrawals(wallet: OnchainWallet, store: BitcoinStore,
  scope: string, cursor: BitcoinRequestCursor, assertCurrent: () => void, pageBudget = 4): Promise<boolean> {
  const mergePage = async (page: (CoopExitRequest | ClaimStaticDeposit)[]) => {
    const updates: ProviderWithdrawalMerge[] = [];
    for (const item of page) {
      if (item.typename !== 'CoopExitRequest') continue;
      const request = item as CoopExitRequest;
      if (!scope.startsWith(`${request.network}:`)) continue;
      if (typeof request.id !== 'string' || !request.id ||
          !Number.isFinite(Date.parse(request.createdAt))) {
        throw new Error('Bitcoin provider returned an invalid withdrawal.');
      }
      updates.push({ requestId: request.id, quoteId: request.feeQuoteId, transform: previous => {
        if (previous && !previous.recoveredFromProvider) {
          if (previous.quoteId !== request.feeQuoteId) throw new Error('Bitcoin withdrawal quote changed.');
          return { ...previous, ...withdrawalResolution(previous, request), requestId: request.id };
        }
        const recovered: BitcoinOperation = previous ?? {
          id: `withdraw:provider:${request.id}`, scope, network: request.network as BitcoinNetwork,
          kind: 'withdrawal', address: '', amountSats: 0, feeSats: null,
          quoteId: request.feeQuoteId, requestId: request.id,
          state: 'pending', createdAt: request.createdAt, recoveredFromProvider: true,
        };
        return { ...recovered, ...withdrawalResolution(recovered, request) };
      } });
    }
    if (updates.length) await store.mergeProviderWithdrawals(scope, updates, assertCurrent);
  };
  if (!Number.isSafeInteger(pageBudget) || pageBudget < 1 || pageBudget > 20) {
    throw new Error('Invalid Bitcoin provider page budget.');
  }
  return cursor.runWithdrawalRecovery(scope, async (state, checkpoint) => {
    const page = async (after?: string) => {
      assertCurrent();
      const result = await timed(wallet.getUserRequests({ first: 50, after,
        types: ['COOP_EXIT'] as RequestKinds,
      }), 12_000);
      assertCurrent();
      if (!result || !Array.isArray(result.entities) || !result.pageInfo ||
          typeof result.pageInfo.hasNextPage !== 'boolean') {
        throw new Error('Bitcoin provider history is unavailable.');
      }
      const requests = result.entities.filter(item => item.typename === 'CoopExitRequest') as CoopExitRequest[];
      await mergePage(requests);
      assertCurrent();
      return { result, requests };
    };
    if (state.phase === 'history') {
      // A v1 cursor has no trustworthy head checkpoint. Start at page one
      // again rather than treating previously imported IDs as proof of a gap.
      for (let count = 0; count < pageBudget; count++) {
        const after = state.historyAfter;
        const { result, requests } = await page(after);
        if (after === undefined) state.historyHead = requests[0]?.id ?? null;
        if (!result.pageInfo.hasNextPage) {
          state.verifiedHead = state.historyHead;
          state.historyAfter = undefined;
          state.phase = 'head';
          await checkpoint();
          break;
        }
        const next = result.pageInfo.endCursor;
        if (!next || next === after) throw new Error('Bitcoin provider history cursor is invalid.');
        state.historyAfter = next;
        await checkpoint();
      }
      if (state.phase === 'history') return false;
    }
    if (state.phase === 'ready') {
      state.phase = 'head';
      state.headAfter = undefined;
      state.headFirst = undefined;
      await checkpoint();
    }
    for (let count = 0; count < pageBudget; count++) {
      const after = state.headAfter;
      const { result, requests } = await page(after);
      if (after === undefined) state.headFirst = requests[0]?.id ?? null;
      const reachedAnchor = state.verifiedHead !== null && state.verifiedHead !== undefined &&
        requests.some(request => request.id === state.verifiedHead);
      if (reachedAnchor || !result.pageInfo.hasNextPage) {
        // New requests may arrive while the scan is on an older page. A final
        // head read must match the beginning we just covered. If it moved,
        // keep the last *verified* anchor and scan the entire gap again.
        const { requests: currentHead } = await page(undefined);
        if ((currentHead[0]?.id ?? null) !== state.headFirst) {
          state.headAfter = undefined;
          state.headFirst = undefined;
          await checkpoint();
          return false;
        }
        state.verifiedHead = state.headFirst;
        state.phase = 'ready';
        state.headAfter = undefined;
        state.headFirst = undefined;
        await checkpoint();
        return true;
      }
      const next = result.pageInfo.endCursor;
      if (!next || next === after) throw new Error('Bitcoin provider history cursor is invalid.');
      state.headAfter = next;
      await checkpoint();
    }
    return false;
  });
}

export async function reconcileBitcoinWithdrawals(wallet: OnchainWallet, store: BitcoinStore, scope: string,
  assertCurrent: () => void, cursor?: BitcoinRequestCursor): Promise<BitcoinOperation[]> {
  const records = (await store.listActive(scope)).filter(row => row.kind === 'withdrawal');
  let requests: Awaited<ReturnType<typeof listBitcoinRequests>> | undefined;
  const withoutRequestId: BitcoinOperation[] = [];
  for (const record of records) {
    assertCurrent();
    if (record.state === 'prepared') {
      // The SDK is never entered until checking is durably written. A prepared
      // record left by a stopped process is therefore safe to release.
      await store.abortBeforeSubmission(scope, record.id, 'prepared');
      continue;
    }
    if (record.state === 'aborted' || record.state === 'failed') continue;
    try {
      let request: CoopExitRequest | null | undefined;
      if (record.requestId) request = await timed(wallet.getCoopExitRequest(record.requestId), 12_000);
      else if (cursor) { withoutRequestId.push(record); continue; }
      else {
        requests ??= await listBitcoinRequests(wallet);
        const matches = requests.filter(item => item.typename === 'CoopExitRequest' && (item as CoopExitRequest).feeQuoteId === record.quoteId && item.network === record.network);
        if (matches.length === 1) request = matches[0] as CoopExitRequest;
      }
      assertCurrent();
      if (request) await store.update(scope, record.id, current => ({ ...current!, ...withdrawalResolution(current!, request!) }), assertCurrent);
    } catch { /* Retain unknown, never infer nonpayment from a failed read. */ }
  }
  if (cursor && withoutRequestId.length) {
    try {
      await scanBitcoinRequestPages(wallet, cursor, scope, 'withdrawal-lookup', async page => {
        for (const record of withoutRequestId) {
          const matches = page.filter(item => item.typename === 'CoopExitRequest' &&
            (item as CoopExitRequest).feeQuoteId === record.quoteId && item.network === record.network);
          if (matches.length !== 1) continue;
          const request = matches[0] as CoopExitRequest;
          await store.update(scope, record.id, current =>
            current?.requestId || current?.state === 'confirmed' ? current! :
              ({ ...current!, ...withdrawalResolution(current!, request) }), assertCurrent);
        }
      }, assertCurrent);
    } catch { /* Preserve pending records and the last committed search page. */ }
  }
  return store.listActive(scope);
}
