import type { SparkWallet } from '@buildonspark/spark-sdk';
import { Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { readBitcoinBalance, sats } from './amount';
import { bitcoinNetwork, validateBitcoinAddress, type BitcoinNetwork } from './destination';
import { withTimeout } from '../promise-timeout';
import type { BitcoinOperation, BitcoinStore } from './store';

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
  amountSats: number, assertAuthorized: () => void): Promise<PreparedBitcoinWithdrawal> {
  address = validateBitcoinAddress(address, network);
  if (sats(amountSats) <= 0) throw new Error('Enter a positive amount.');
  const scope = await bitcoinScope(wallet, network);
  assertAuthorized();
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
  assertAuthorized: () => void): Promise<BitcoinOperation> {
  // Snapshot every authorized field; presentation edits cannot mutate this call.
  const approved = { ...payment };
  assertAuthorized();
  if (approved.scope !== await bitcoinScope(wallet, approved.network)) throw new Error('Wallet changed.');
  assertAuthorized();
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
  await store.update(operation.scope, operation.id, old => ({ ...old!, state: 'checking' }), assertAuthorized);
  assertAuthorized();
  if (approved.expiresAt <= Date.now()) throw new Error('The Bitcoin fee quote expired. Review this payment again.');
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
  const base: Partial<BitcoinOperation> = { requestId: request.id, state: 'pending' };
  try {
    const tx = Transaction.fromRaw(hex.decode(request.rawCoopExitTransaction), { allowUnknownOutputs: true });
    let recipient = 0n;
    for (let index = 0; index < tx.outputsLength; index++) {
      if (tx.getOutputAddress(index, bitcoinNetwork(record.network)) === record.address) recipient += tx.getOutput(index).amount ?? 0n;
    }
    if (recipient !== BigInt(record.amountSats) || currencySats(request.fee) + currencySats(request.l1BroadcastFee) > record.feeSats!) return base;
    base.txid = tx.id;
    if (request.status === 'SUCCEEDED') base.state = 'confirmed';
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
    if (!result) break;
    for (const item of result.entities) {
      if (item.typename === 'CoopExitRequest' || item.typename === 'ClaimStaticDeposit') requests.push(item as CoopExitRequest | ClaimStaticDeposit);
    }
    if (!result.pageInfo.hasNextPage) break;
    const cursor = result.pageInfo.endCursor;
    if (!cursor || cursor === after) break;
    after = cursor;
  }
  return requests;
}

export async function reconcileBitcoinWithdrawals(wallet: OnchainWallet, store: BitcoinStore, scope: string,
  assertCurrent: () => void): Promise<BitcoinOperation[]> {
  const records = (await store.list(scope)).filter(row => row.kind === 'withdrawal' && row.state !== 'confirmed');
  let requests: Awaited<ReturnType<typeof listBitcoinRequests>> | undefined;
  for (const record of records) {
    assertCurrent();
    try {
      let request: CoopExitRequest | null | undefined;
      if (record.requestId) request = await timed(wallet.getCoopExitRequest(record.requestId), 12_000);
      else {
        requests ??= await listBitcoinRequests(wallet);
        const matches = requests.filter(item => item.typename === 'CoopExitRequest' && (item as CoopExitRequest).feeQuoteId === record.quoteId && item.network === record.network);
        if (matches.length === 1) request = matches[0] as CoopExitRequest;
      }
      assertCurrent();
      if (request) await store.update(scope, record.id, current => ({ ...current!, ...withdrawalResolution(current!, request!) }), assertCurrent);
    } catch { /* Retain unknown, never infer nonpayment from a failed read. */ }
  }
  return store.list(scope);
}
