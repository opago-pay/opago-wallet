import schemas from '../../docs/transaction-sync/tx-foundation-v3/schemas.json';
import api from '../../docs/transaction-sync/tx-foundation-v3/openapi-public.json';
import { matchesSchema, type Schema } from './contract';
export const TX_CONTRACT = 'tx-foundation-v3' as const;
export const TX_REVISION = '3.0.0-draft.1' as const;
export const txDefinitions = schemas.$defs as unknown as Record<string, Schema>;
export function assertTxContract<T>(name: string, value: unknown): asserts value is T {
  if (!txDefinitions[name] || !matchesSchema(txDefinitions[name], value, txDefinitions)) throw new Error('sync_invalid_contract');
}
export function txRoute(method: string, path: string) {
  const paths = api.paths as unknown as Record<string, Record<string, { operationId: string;
    'x-opago-error-codes': string[];
    requestBody?: { content: Record<string, { schema: Schema }> }; responses: Record<string, { content?: Record<string, { schema: Schema }> }> }>>;
  const uuidPath = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
  const template = Object.keys(paths).find(p => new RegExp('^' + p.replace(/\{[^}]+\}/g, uuidPath) + '$').test(path));
  const route = template && paths[template][method.toLowerCase()];
  if (!route) throw new Error('sync_invalid_contract');
  const status = Number(Object.keys(route.responses).find(s => /^2\d\d$/.test(s)));
  return { operation: route.operationId, status, errors: route['x-opago-error-codes'], statuses: Object.keys(route.responses),
    request: route.requestBody?.content['application/json'].schema || { $ref: '#/$defs/Empty' },
    response: route.responses[String(status)].content?.['application/json'].schema };
}
export type PaymentStatus = 'pending' | 'settled' | 'failed' | 'canceled';
export type Report = { direction: 'incoming' | 'outgoing'; sdk_status: string; status: PaymentStatus | null; source_payment_id: string | null; observed_at?: string } & (
  { asset: 'BTC'; rail: 'spark' | 'lightning'; id_source: 'SPARK_TRANSFER_ID' | 'SPARK_LIGHTNING_REQUEST_ID'; amount_msat: number | null; payment_hash?: string; bolt11?: string } |
  { asset: 'HBAR'; rail: 'hedera'; id_source: 'HEDERA_TRANSACTION_ID'; network: 'mainnet' | 'testnet'; amount_tinybar: number | null; counterparty_account_id?: string; consensus_timestamp?: string });
export type Receipt = { receipt_id: string; received_at: string; wallet_id: string; id_source: Report['id_source']; source_payment_id: string | null;
  external_id: string | null; resolution: 'linked' | 'unresolved' | 'quarantined' | 'non_payment'; transaction_id: string | null;
  verification_status: 'wallet_reported' | 'verified'; retry_due_at: string | null };
export const externalId = (report: Pick<Report, 'id_source' | 'source_payment_id'>) => report.source_payment_id === null ? null :
  ({ SPARK_TRANSFER_ID: 'spark-transfer:', SPARK_LIGHTNING_REQUEST_ID: 'spark-lightning-request:', HEDERA_TRANSACTION_ID: 'hedera-tx:' })[report.id_source] + report.source_payment_id;
export function checkReceipt(receipt: unknown, walletId: string, report: Report): asserts receipt is Receipt {
  assertTxContract<Receipt>('WalletPaymentReceipt', receipt);
  if (receipt.wallet_id !== walletId || receipt.id_source !== report.id_source || receipt.source_payment_id !== report.source_payment_id ||
    receipt.external_id !== externalId(report)) throw new Error('sync_invalid_receipt');
}
