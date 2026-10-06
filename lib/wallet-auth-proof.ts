import { sha256 } from '@noble/hashes/sha256';

type LoginIntent = { action: 'login' | 'onboarding_restart'; action_params: Record<string, never> };
type BindIntent = { action: 'wallet_bind'; action_params: { party_id: string; account_generation: number } };
type RestoreIntent = { action: 'wallet_restore'; action_params: { wallet_id: string; party_id: string; account_generation: number } };
type NameIntent = { action: 'address_bind' | 'address_rename'; action_params: { name: string } };
type AddressIntent = { action: 'address_deactivate' | 'address_reactivate'; action_params: { address_id: string } };
type CloseIntent = { action: 'wallet_close'; action_params: { wallet_id: string } };
export type WalletAuthIntent = LoginIntent | BindIntent | RestoreIntent | NameIntent | AddressIntent | CloseIntent;
export type WalletAuthChallenge = { challenge_id: string; message: string; expires_at: string };
export type WalletAuthVerifyRequest = { challenge_id: string; signature: string; installation_id: string };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const time = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const nonce = /^[0-9a-f]{64}$/;
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const utf8 = (value: string) => new TextEncoder().encode(value);

/** The F3 subset of the 0.2.0 JCS action parameters; reject unexpected keys. */
function canonicalActionParams(intent: WalletAuthIntent): string {
  if (intent.action === 'login' || intent.action === 'onboarding_restart') {
    if (Object.keys(intent.action_params).length) throw new Error('Invalid login parameters.');
    return '{}';
  }
  const params = intent.action_params as Record<string, unknown>;
  const expected = { wallet_bind: ['account_generation', 'party_id'], wallet_restore: ['account_generation', 'party_id', 'wallet_id'],
    address_bind: ['name'], address_rename: ['name'], address_deactivate: ['address_id'], address_reactivate: ['address_id'],
    wallet_close: ['wallet_id'] }[intent.action as Exclude<WalletAuthIntent['action'], 'login' | 'onboarding_restart'>];
  if (!expected || Object.keys(params).sort().join(',') !== expected.join(',')) throw new Error('Invalid action parameters.');
  for (const key of expected) {
    const value = params[key];
    if (key === 'account_generation' ? !Number.isSafeInteger(value) || Number(value) < 1 :
        key === 'name' ? typeof value !== 'string' || !/^(?!.*\.\.)[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/.test(value) :
        typeof value !== 'string' || !uuid.test(value)) throw new Error('Invalid action parameters.');
  }
  return '{' + expected.map(k => JSON.stringify(k) + ':' + JSON.stringify(params[k])).join(',') + '}';
}

/** Verify every server-supplied field before asking the Spark identity key to sign. */
export function walletAuthChallengeDigest(
  challenge: WalletAuthChallenge,
  intent: WalletAuthIntent,
  network: 'mainnet' | 'regtest',
  compressedPubkey: Uint8Array,
  now = Date.now(),
): Uint8Array {
  if (!uuid.test(challenge.challenge_id) || compressedPubkey.length !== 33 ||
      (compressedPubkey[0] !== 2 && compressedPubkey[0] !== 3)) {
    throw new Error('Invalid wallet auth challenge.');
  }
  const lines = challenge.message.split('\n');
  if (lines.length !== 9 || lines[0] !== 'opago-wallet-auth' ||
      lines[1] !== 'domain: api.opago.com' ||
      lines[2] !== `network: ${network}` ||
      lines[3] !== `wallet_pubkey: ${hex(compressedPubkey)}` ||
      lines[7] !== `action: ${intent.action}` ||
      lines[8] !== `action_params_sha256: ${hex(sha256(utf8(canonicalActionParams(intent))))}`) {
    throw new Error('Wallet auth challenge does not match the requested action.');
  }
  const challengeNonce = lines[4].slice('nonce: '.length);
  const issuedAt = lines[5].slice('issued_at: '.length);
  const expiresAt = lines[6].slice('expires_at: '.length);
  if (!lines[4].startsWith('nonce: ') || !nonce.test(challengeNonce) ||
      !lines[5].startsWith('issued_at: ') || !lines[6].startsWith('expires_at: ') ||
      !time.test(issuedAt) || !time.test(expiresAt) ||
      challenge.expires_at !== expiresAt) {
    throw new Error('Invalid wallet auth challenge fields.');
  }
  const issued = Date.parse(issuedAt);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) ||
      expires - issued > 300_000 || expires <= issued || issued > now + 60_000 || expires <= now) {
    throw new Error('Wallet auth challenge expired or has invalid lifetime.');
  }
  return sha256(utf8(challenge.message));
}

export async function signWalletAuthChallenge(
  signer: { getIdentityPublicKey(): Promise<Uint8Array>; signSchnorrWithIdentityKey(digest: Uint8Array): Promise<Uint8Array> },
  challenge: WalletAuthChallenge,
  intent: WalletAuthIntent,
  network: 'mainnet' | 'regtest',
  installationId: string,
  now = Date.now(),
): Promise<WalletAuthVerifyRequest> {
  if (!uuid.test(installationId)) throw new Error('Invalid installation ID.');
  const pubkey = await signer.getIdentityPublicKey();
  const digest = walletAuthChallengeDigest(challenge, intent, network, pubkey, now);
  const signature = await signer.signSchnorrWithIdentityKey(digest);
  if (signature.length !== 64) throw new Error('Invalid Spark identity signature.');
  return { challenge_id: challenge.challenge_id, signature: hex(signature), installation_id: installationId };
}
