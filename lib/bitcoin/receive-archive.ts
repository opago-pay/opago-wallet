import AsyncStorage from '@react-native-async-storage/async-storage';
import { addTransaction } from '../database';
import { resolveLightningReceive, type SparkReceiveWalletLike } from '../lightning/receive-status';
import type { StoredLightningReceiveRequest } from '../lightning/receive-store';
import { sats } from './amount';

const KEY = 'opago.bitcoin.receive-tracking.v1';
export interface TrackedBitcoinRequest {
  scope: string; requestId: string; paymentHash: string; amountSats: number;
  expiresAt: number; createdAt: string; state: 'waiting' | 'confirmed';
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
    if (!row.scope || !row.requestId || !/^[a-f\d]{64}$/.test(row.paymentHash) || sats(row.amountSats) <= 0 || !['waiting', 'confirmed'].includes(row.state)) {
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
    if (records.length >= 10_000) throw new Error('Bitcoin request storage is full.');
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
  const waiting = (await exclusive(read)).filter(row => row.scope === scope && row.state !== 'confirmed');
  // Rotate through old/expired requests; neither a newer QR nor expiry erases
  // late-payment tracking. Each pass has bounded network work.
  const start = (offsets.get(scope) ?? 0) % Math.max(1, waiting.length);
  const batch = [...waiting.slice(start), ...waiting.slice(0, start)].slice(0, 3);
  offsets.set(scope, start + batch.length);
  let confirmed = 0;
  for (const record of batch) {
    assertCurrent();
    const status = await resolveLightningReceive(wallet, record);
    assertCurrent();
    if (status !== 'confirmed') continue;
    await exclusive(async () => {
      if (epoch !== generation) return;
      assertCurrent();
      const records = await read();
      assertCurrent();
      const current = records.find(row => row.scope === scope && row.paymentHash === record.paymentHash);
      if (!current || current.state === 'confirmed') return;
      // Activity and archive can be replayed: payment hash is the unique key.
      await addTransaction('incoming', current.amountSats, 'SAT', { txId: `ln:${current.paymentHash}`, reference: current.requestId, status: 'confirmed' });
      assertCurrent();
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
