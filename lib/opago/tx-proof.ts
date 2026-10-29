import { assertTxContract } from './tx-contract';
import { utf8 } from './encoding';
import { SyncError } from './tx-sync';
export type V3Challenge = { challenge_id: string; purpose: 'bind' | 'session'; message: string; expires_at: string };
export type V3ProofContext = { purpose: V3Challenge['purpose']; tenant: string; subject: string; source: 'spark' | 'hedera';
  sourceWalletId: string; network: 'mainnet' | 'testnet' | '-'; installationId: string | '-' };
/** Validate every action/account/key/network field before the existing signing boundary.
 * OQ-AUTH-1/6 must be resolved before a live signer can be supplied. */
export async function signV3Challenge(challenge: V3Challenge, expected: V3ProofContext,
  ports: { resolution: string; consent(): Promise<() => void>; sign(bytes: Uint8Array): Promise<string>; assertCurrent(): void }, now = Date.now()) {
  if (!ports.resolution) throw new SyncError('sync_backend_pending');
  assertTxContract('WalletChallenge', challenge);
  const lines = challenge.message.split('\n');
  const expectedLines = ['opago-tx-foundation-v3','purpose:' + expected.purpose,'tenant:' + expected.tenant,'subject:' + expected.subject,
    'wallet_source:' + expected.source,'source_wallet_id:' + expected.sourceWalletId,'network:' + expected.network,
    'installation_id:' + expected.installationId,'challenge_id:' + challenge.challenge_id];
  if (challenge.purpose !== expected.purpose || expectedLines.some((line, i) => line !== lines[i]) ||
    lines[10] !== 'expires_at:' + challenge.expires_at || Date.parse(challenge.expires_at) <= now) throw new SyncError('challenge_invalid');
  ports.assertCurrent(); const authorized = await ports.consent(); ports.assertCurrent(); authorized();
  const signature = await ports.sign(utf8(challenge.message)); ports.assertCurrent(); authorized();
  assertTxContract('Signature', signature);
  return { challenge_id: challenge.challenge_id, signature };
}
