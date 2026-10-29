import { OpagoError } from './api';
import type { F3Integration } from './runtime-native';

/** Preserve the production boundary until the backend wallet lifecycle is accepted.
 * Existing EAS profiles already opt into F3; that build flag and successful public
 * configuration/HPKE discovery are not proof that account binding is available.
 * binding-integration-native.ts prepares the adapter for a separately reviewed
 * rollout. Do not import or invoke it here before that acceptance. Public browser
 * account login/signup and local self-custodial funds remain independent.
 */
export async function createNativeF3Integration(): Promise<F3Integration> {
  throw new OpagoError('wallet_session_contract_pending');
}
