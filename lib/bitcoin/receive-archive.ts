import AsyncStorage from '@react-native-async-storage/async-storage';
import { addTransaction } from '../database';
import { resolveLightningReceiveOutcome, type SparkReceiveWalletLike } from '../lightning/receive-status';
import type { StoredLightningReceiveRequest } from '../lightning/receive-store';
import { sats } from './amount';

const KEY = 'opago.bitcoin.receive-tracking.v1';
export interface TrackedBitcoinRequest {
  scope: string; requestId: string; paymentHash: string; amountSats: number;
  expiresAt: number; createdAt: string; state: 'waiting' | 'confirmed' | 'failed';
  nextCheckAt?: number;
}
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
function exclusive<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation); queue = result.catch(() => undefined); return result;
}
async function read(): Promise<TrackedBitcoinRequest[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (raw === null) return [];
  const records = JSON.parse(raw);
  if (!Array.isArray(records)) throw new Error('Bitcoin request storage is unavailable.');
  for (const row of records) {
    if (!row.scope || !row.requestId || !/^[a-f\d]{64}$/.test(row.paymentHash) || sats(row.amountSats) < 0 ||
      !['waiting', 'confirmed', 'failed'].includes(row.state) ||
      (row.nextCheckAt !== undefined && (!Number.isSafeInteger(row.nextCheckAt) || row.nextCheckAt < 0))) {
      throw new Error('Bitcoin request storage is unavailable.');
    }
  }
  return records;
}
export function archiveBitcoinRequest(scope: string, request: StoredLightningReceiveRequest, assertCurrent: () => void) {
  const epoch = generation;
  return exclusive(async () => {
    assertCurrent();
    const records = await read();
    assertCurrent();
    if (epoch !== generation) throw new Error('Wallet changed.');
    if (records.some(row => row.scope === scope && row.paymentHash === request.paymentHash)) return;
    // Completed requests are already in the activity database. Retain a
    // bounded recent audit trail while preserving every unresolved request.
    if (records.length >= 10_000) {
      const oldestSettled = records.findIndex(row => row.state !== 'waiting');
      if (oldestSettled < 0) throw new Error('Bitcoin request storage is full.');
      records.splice(oldestSettled, 1);
    }
    // No invoices or descriptions in this archive. Amount/time are never used
    // to match an onchain payment to a Lightning request.
    records.push({ scope, requestId: request.requestId, paymentHash: request.paymentHash, amountSats: request.amountSats,
      expiresAt: request.expiresAt, createdAt: request.createdAt, state: 'waiting' });
    await AsyncStorage.setItem(KEY, JSON.stringify(records));
  });
}
const offsets = new Map<string, number>();
export async function reconcileArchivedBitcoinRequests(wallet: SparkReceiveWalletLike, scope: string, assertCurrent: () => void) {
  const epoch = generation;
  const waiting = (await exclusive(read)).filter(row => row.scope === scope && row.state === 'waiting' &&
    (row.nextCheckAt ?? 0) <= Date.now());
  // Expired unresolved requests remain available for occasional rechecks,
  // while active requests do not queue behind the entire old archive.
  const start = (offsets.get(scope) ?? 0) % Math.max(1, waiting.length);
  const batch = [...waiting.slice(start), ...waiting.slice(0, start)].slice(0, 3);
  offsets.set(scope, start + batch.length);
  let confirmed = 0;
  for (const record of batch) {
    assertCurrent();
    const outcome = await resolveLightningReceiveOutcome(wallet, record);
    assertCurrent();
    const confirmedAmount = outcome.state === 'confirmed' ? outcome.amountSats : null;
    await exclusive(async () => {
      if (epoch !== generation) return;
      assertCurrent();
      const records = await read();
      assertCurrent();
      const current = records.find(row => row.scope === scope && row.paymentHash === record.paymentHash);
      if (!current || current.state !== 'waiting') return;
      if (outcome.state === 'failed') {
        current.state = 'failed';
        await AsyncStorage.setItem(KEY, JSON.stringify(records));
        return;
      }
      if (!confirmedAmount) {
        if (current.expiresAt <= Date.now()) {
          const recentlyExpired = Date.now() - current.expiresAt < 24 * 60 * 60_000;
          current.nextCheckAt = Date.now() + (recentlyExpired ? 5 * 60_000 : 6 * 60 * 60_000);
          await AsyncStorage.setItem(KEY, JSON.stringify(records));
        }
        return;
      }
      // Activity and archive can be replayed: payment hash is the unique key.
      await addTransaction('incoming', confirmedAmount, 'SAT', { txId: `ln:${current.paymentHash}`, reference: current.requestId, status: 'confirmed' });
      assertCurrent();
      current.amountSats = confirmedAmount;
      current.state = 'confirmed';
      await AsyncStorage.setItem(KEY, JSON.stringify(records));
      confirmed += 1;
    });
  }
  return confirmed;
}
export function clearBitcoinReceiveArchive() {
  generation += 1; offsets.clear();
  return exclusive(() => AsyncStorage.removeItem(KEY));
}
