import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { schnorr } from '@noble/curves/secp256k1';

/** Separate from the 0.2.0 opago-wallet-auth message. No caller-supplied URLs. */
export type V3SessionContext = {
  tenant: 'opago'; subject: string; walletId: string; sourceWalletId: string; installationId: string;
};
export type V3SessionChallenge = { challenge_id: string; purpose: 'session'; message: string; expires_at: string };
export const sessionUuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function sessionTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) throw new Error('Invalid session timestamp');
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().replace('.000Z', 'Z') !== value) throw new Error('Invalid session timestamp');
  return time;
}
export function assertSessionContext(context: V3SessionContext): void {
  if (context.tenant !== 'opago' || !sessionUuid(context.subject) || !sessionUuid(context.walletId) ||
      !sessionUuid(context.installationId) || !/^(?:0[23])?[0-9a-f]{64}$/.test(context.sourceWalletId)) throw new Error('Invalid session context');
  // Validate the x-only point as well as its wire shape.
  schnorr.utils.lift_x(BigInt('0x' + context.sourceWalletId.slice(-64)));
}
export function v3SessionChallengeDigest(value: unknown, context: V3SessionContext, now = Date.now()): Uint8Array {
  assertSessionContext(context);
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== 'challenge_id,expires_at,message,purpose') throw new Error('Invalid session challenge');
  const challenge = value as V3SessionChallenge;
  if (!sessionUuid(challenge.challenge_id) || challenge.purpose !== 'session' || typeof challenge.message !== 'string' ||
      challenge.message.length > 4096 || !Number.isFinite(now)) throw new Error('Invalid session challenge');
  const expires = sessionTimestamp(challenge.expires_at);
  if (expires <= now || expires > now + 300_000) throw new Error('Session challenge expired or lifetime invalid');
  const lines = challenge.message.split('\n');
  const nonce = lines[9]?.slice('nonce:'.length);
  if (!/^[0-9a-f]{64}$/.test(nonce || '')) throw new Error('Invalid session nonce');
  const expected = ['opago-tx-foundation-v3', 'purpose:session', 'tenant:' + context.tenant,
    'subject:' + context.subject, 'wallet_source:spark', 'source_wallet_id:' + context.sourceWalletId,
    'network:-', 'installation_id:' + context.installationId, 'challenge_id:' + challenge.challenge_id,
    'nonce:' + nonce, 'expires_at:' + challenge.expires_at].join('\n');
  if (challenge.message !== expected) throw new Error('Session challenge context mismatch');
  return sha256(utf8ToBytes(challenge.message));
}
export interface V3SessionSigner {
  getIdentityPublicKey(): Promise<Uint8Array>;
  signSchnorrWithIdentityKey(digest: Uint8Array): Promise<Uint8Array>;
}
/** authorize must perform explicit user/device consent and return a live runtime guard. */
export async function signV3SessionChallenge(signer: V3SessionSigner, challenge: V3SessionChallenge,
  context: V3SessionContext, authorize: () => Promise<() => void>, now = () => Date.now()) {
  const expected = { ...context }; const frozen = { ...challenge };
  const digest = v3SessionChallengeDigest(frozen, expected, now());
  const publicKey = await signer.getIdentityPublicKey();
  if (publicKey.length !== 33 || ![2, 3].includes(publicKey[0]) ||
      bytesToHex(publicKey.slice(1)) !== expected.sourceWalletId.slice(-64) ||
      (expected.sourceWalletId.length === 66 && bytesToHex(publicKey) !== expected.sourceWalletId)) throw new Error('Session signer mismatch');
  const current = await authorize(); current();
  v3SessionChallengeDigest(frozen, expected, now());
  const signature = await signer.signSchnorrWithIdentityKey(digest);
  current(); v3SessionChallengeDigest(frozen, expected, now());
  if (signature.length !== 64 || !schnorr.verify(signature, digest, publicKey.slice(1))) throw new Error('Invalid session signature');
  return { challenge_id: frozen.challenge_id, signature: bytesToHex(signature) };
}
