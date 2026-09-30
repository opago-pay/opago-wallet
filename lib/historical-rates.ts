import { fetchJson } from './http';
import { assertTransactionRate, type TransactionRateJob, type TransactionRate } from './transaction-rates';

type JsonReader = (url: string) => Promise<unknown>;
const read: JsonReader = url => fetchJson(url, {}, {
  purpose: 'Historical exchange rate', timeoutMs: 8_000, maxResponseChars: 16_384, trustedFixedOrigin: true,
});
const requests = new Map<string, Promise<number>>();

/** A fixed UTC one-minute opening price, never a future closing/current price. */
export async function loadHistoricalTransactionRate(job: TransactionRateJob, readJson: JsonReader = read,
  now = Date.now()): Promise<TransactionRate> {
  let transactionAt = job.transactionAt;
  let timeBasis: TransactionRate['timeBasis'] = job.timeBasis;
  if (job.bitcoinTxId) {
    const status = await readJson(`https://mempool.space/api/tx/${job.bitcoinTxId}/status`) as {
      confirmed?: unknown; block_time?: unknown; block_hash?: unknown };
    if (status?.confirmed !== true || !Number.isSafeInteger(status.block_time) || Number(status.block_time) <= 0 ||
        typeof status.block_hash !== 'string' || !/^[a-f0-9]{64}$/.test(status.block_hash)) throw new Error('Bitcoin block time unavailable.');
    transactionAt = new Date(Number(status.block_time) * 1000).toISOString();
    timeBasis = 'block';
  }
  const timestamp = transactionAt ? Date.parse(transactionAt) : NaN;
  if (!Number.isFinite(timestamp) || timestamp > now + 120_000) throw new Error('Transaction time unavailable.');
  const minute = Math.floor(timestamp / 60_000) * 60_000;
  async function price(symbol: 'BTCEUR' | 'BTCUSDT' | 'HBARUSDT') {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${minute}&endTime=${minute + 59_999}&limit=1`;
    const query = async () => {
      const rows = await readJson(url);
      if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0]) || rows[0][0] !== minute ||
          rows[0][6] !== minute + 59_999 || typeof rows[0][1] !== 'string') throw new Error('Historical price unavailable.');
      const value = Number(rows[0][1]);
      if (!Number.isFinite(value) || value <= 0 || value > 1e12) throw new Error('Invalid historical price.');
      return value;
    };
    // Only share production requests; injected readers remain isolated in tests.
    if (readJson !== read) return query();
    let task = requests.get(url);
    if (!task) { task = query(); requests.set(url, task); void task.finally(() => requests.delete(url)).catch(() => undefined); }
    return task;
  }
  const btcEur = await price('BTCEUR');
  const eurPerCoin = job.asset === 'BTC' ? btcEur : (await price('HBARUSDT')) / (await price('BTCUSDT')) * btcEur;
  const quote: TransactionRate = { asset: job.asset, eurPerCoin, transactionAt: transactionAt!,
    rateAt: new Date(minute).toISOString(), fetchedAt: new Date(now).toISOString(), source: 'Binance',
    method: job.asset === 'BTC' ? 'minute-open' : 'cross-minute-open', timeBasis };
  assertTransactionRate(quote);
  return quote;
}
