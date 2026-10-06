import { assertContract, routeContract } from './contract';
import type { Error as ContractError } from './contract-types';

export type AuthKind = 'none' | 'account' | 'wallet' | 'receipt';
export type Request = { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body: unknown;
  idempotencyKey?: string; auth: AuthKind; bearer?: string; contract?: 'tx-foundation-v3' };
/** HKA owns key discovery, pinned roots, fresh HPKE envelopes and authenticated decryption.
 * No legacy login encryption or plaintext fallback may satisfy this boundary. */
export interface HkaTransport {
  readonly mode: 'hka' | 'contract-test';
  request(request: Request): Promise<{ status: number; body: unknown; authenticated: true; retryAfterSeconds?: number; requestId?: string }>;
}
export class OpagoError extends Error {
  constructor(readonly code: string, readonly retryable = false, readonly status = 0, readonly retryAfterSeconds = 0) {
    super(code); this.name = 'OpagoError';
  }
}
export class OpagoApi {
  constructor(readonly transport: HkaTransport) {}
  async call<T>(request: Request): Promise<T> {
    const contract = routeContract(request.method, request.path);
    assertContract(contract.request, request.body);
    if (request.method !== 'GET' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.idempotencyKey || '')) throw new Error('A durable operation key is required.');
    if (request.auth !== 'none' && !request.bearer) throw new OpagoError('session_expired');
    const result = await this.transport.request(request);
    if (result.authenticated !== true) throw new Error('Unauthenticated API response.');
    if (result.status !== contract.status) {
      assertContract<ContractError>('Error', result.body);
      throw new OpagoError(result.body.error.code, result.body.error.retryable, result.status, result.retryAfterSeconds);
    }
    assertContract<T>(contract.response, result.body);
    return result.body;
  }
}
