import type { HkaTransport } from './api';
import { assertTxContract, txRoute, txDefinitions, TX_CONTRACT, type Report, type Receipt } from './tx-contract';
import { matchesSchema } from './contract';
import errors from '../../docs/transaction-sync/tx-foundation-v3/errors.json';
import { SyncError, type TxAuthorization, type TxPort, type SyncOwner } from './tx-sync';
export async function v3Call<T>(transport: HkaTransport, method: 'GET' | 'POST', path: string, body: unknown,
  auth: 'account' | 'wallet', bearer: string, key?: string): Promise<T> {
  const route = txRoute(method, path);
  if (!matchesSchema(route.request, body, txDefinitions) || !bearer || method === 'POST' && !key) throw new SyncError('sync_invalid_contract');
  if (key) assertTxContract('Uuid', key);
  const result = await transport.request({ method, path, body, contract: TX_CONTRACT, auth, bearer, idempotencyKey: key });
  if (result.authenticated !== true) throw new SyncError('sync_invalid_contract');
  if (transport.mode === 'hka') assertTxContract('Uuid', result.requestId);
  if (result.status !== route.status) {
    assertTxContract<{ error: { code: string; retryable: boolean }; request_id: string }>('Error', result.body);
    const error = result.body.error; const catalog = errors.errors.find(e => e.code === error.code);
    if (!catalog || !route.errors.includes(error.code) || !route.statuses.includes(String(result.status)) && !route.statuses.includes('default') || catalog.http_status !== result.status || catalog.retryable !== error.retryable ||
      error.retryable && (!result.retryAfterSeconds || result.retryAfterSeconds < 1)) throw new SyncError('sync_invalid_contract');
    throw new SyncError(error.code, error.retryable, result.retryAfterSeconds);
  }
  if (!route.response || !matchesSchema(route.response, result.body, txDefinitions)) throw new SyncError('sync_invalid_contract');
  return result.body as T;
}
/** Calls only contracted read/report routes. Does not create payments or infer v2/v3 authorization compatibility. */
export class HkaTransactionPort implements TxPort {
  readonly mode = 'hka' as const;
  constructor(readonly transport: HkaTransport, readonly resolveAuthorization: (owner: SyncOwner) => Promise<TxAuthorization>) {
    if (transport.mode !== 'hka') throw new SyncError('sync_invalid_contract');
  }
  authorize(owner: SyncOwner) { return this.resolveAuthorization(owner); }
  private async call(auth: TxAuthorization, method: 'GET' | 'POST', suffix: string, body: unknown, key?: string): Promise<Receipt> {
    assertTxContract('Uuid', auth.walletId);
    const path = '/api/v3/wallets/' + auth.walletId + '/payments/' + suffix;
    return v3Call(this.transport, method, path, body, 'wallet', auth.bearer, key);
  }
  report(auth: TxAuthorization, report: Report, key: string) { return this.call(auth, 'POST', 'reports', report, key); }
  receipt(auth: TxAuthorization, id: string) { assertTxContract('Uuid', id); return this.call(auth, 'GET', 'reports/' + id, {}); }
}
