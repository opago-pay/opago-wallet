import { OpagoError } from './api';
import type { F3Integration } from './runtime-native';

/** Public customer sessions and Keycloak AccountBearer are different contracts.
 * Never turn a customer login into wallet authority, discover an internal issuer,
 * or trust an HPKE document using a root supplied by that same document.
 * The public HPKE root is pinned in hpke-roots.ts. Live F3 still awaits
 * the backend wallet authentication contract; a signing root grants no authority.
 * Local funds and the public account flow are independent.
 */
export async function createNativeF3Integration(): Promise<F3Integration> {
  throw new OpagoError('wallet_session_contract_pending');
}
