import { sha256 } from '@noble/hashes/sha256';
import { schnorr } from '@noble/curves/secp256k1';
import type { WalletAuthChallenge, WalletAuthIntent, WalletAuthVerifyRequest } from '../wallet-auth-proof';

/** Explicitly opt-in only. Never sends credentials or challenges to a production API. */
export const ACCOUNT_LINK_PREVIEW_ENABLED = false;
export type LinkFailure = 'conflict' | 'challenge_expired' | 'network' | 'cancelled';
export type LinkStatus = { accountId: string | null; walletId: string | null; linked: boolean };
export type LinkChallenge = { challenge: WalletAuthChallenge; intent: WalletAuthIntent; accountId: string; walletId: string };
export interface AccountLinkPreviewAdapter {
  login(): Promise<string | null>;
  status(accountId: string): Promise<LinkStatus>;
  challenge(accountId: string, walletId: string): Promise<LinkChallenge>;
  verify(challenge: LinkChallenge, proof: WalletAuthVerifyRequest): Promise<LinkStatus>;
  unlink(accountId: string): Promise<void>;
}
export interface SparkIdentityProof {
  sign(challenge: LinkChallenge): Promise<WalletAuthVerifyRequest>;
}
export class LinkPreviewError extends Error {
  constructor(readonly code: LinkFailure) { super(code); }
}
const toHex = (bytes: Uint8Array) => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string): Uint8Array => Uint8Array.from(hex.match(/../g)?.map(byte => parseInt(byte, 16)) || []);
const time = (ms: number) => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
const text = (value: string) => new TextEncoder().encode(value);
const PARTY_ID = '10000000-0000-4000-8000-000000000001';

/** Mock mimics the existing F3 wallet_bind challenge/verify contract. */
export class MockAccountLinkAdapter implements AccountLinkPreviewAdapter {
  private owner: string | null = null;
  private pending: LinkChallenge | null = null;
  constructor(private readonly walletId: string, private readonly network: 'mainnet' | 'regtest',
    private readonly uuid: () => string, private readonly now = Date.now) {}
  async login() { return 'mock-opago-account'; }
  async status(accountId: string): Promise<LinkStatus> {
    return { accountId, walletId: this.owner === accountId ? this.walletId : null, linked: this.owner === accountId };
  }
  async challenge(accountId: string, walletId: string): Promise<LinkChallenge> {
    if (walletId !== this.walletId || (this.owner && this.owner !== accountId)) throw new LinkPreviewError('conflict');
    if (!/^(02|03)[0-9a-f]{64}$/i.test(walletId)) throw new LinkPreviewError('cancelled');
    const id = this.uuid();
    const intent: WalletAuthIntent = { action: 'wallet_bind', action_params: { party_id: PARTY_ID, account_generation: 1 } };
    const params = '{"account_generation":1,"party_id":"' + PARTY_ID + '"}';
    const issued = time(this.now()), expires = time(this.now() + 60_000);
    const message = ['opago-wallet-auth', 'domain: api.opago.com', 'network: ' + this.network,
      'wallet_pubkey: ' + walletId.toLowerCase(), 'nonce: ' + toHex(sha256(text(id))),
      'issued_at: ' + issued, 'expires_at: ' + expires, 'action: wallet_bind',
      'action_params_sha256: ' + toHex(sha256(text(params)))].join('\n');
    this.pending = { accountId, walletId, intent, challenge: { challenge_id: id, message, expires_at: expires } };
    return this.pending;
  }
  async verify(binding: LinkChallenge, proof: WalletAuthVerifyRequest): Promise<LinkStatus> {
    if (!this.pending || this.pending.challenge.challenge_id !== binding.challenge.challenge_id ||
        this.now() >= Date.parse(binding.challenge.expires_at)) throw new LinkPreviewError('challenge_expired');
    if (binding.accountId !== this.pending.accountId || binding.walletId !== this.walletId ||
        binding.challenge.message !== this.pending.challenge.message || binding.intent.action !== 'wallet_bind') throw new LinkPreviewError('cancelled');
    if (proof.challenge_id !== binding.challenge.challenge_id ||
        !/^[0-9a-f]{128}$/i.test(proof.signature) ||
        !schnorr.verify(fromHex(proof.signature), sha256(text(binding.challenge.message)), fromHex(this.walletId.slice(2)))) {
      throw new LinkPreviewError('cancelled');
    }
    if (this.owner && this.owner !== binding.accountId) throw new LinkPreviewError('conflict');
    this.owner = binding.accountId;
    this.pending = null;
    return this.status(binding.accountId);
  }
  async unlink(accountId: string) {
    if (this.owner === accountId) this.owner = null;
    this.pending = null;
  }
}
export async function linkWithSparkProof(adapter: AccountLinkPreviewAdapter, signer: SparkIdentityProof, accountId: string, walletId: string) {
  const binding = await adapter.challenge(accountId, walletId);
  const proof = await signer.sign(binding);
  return adapter.verify(binding, proof);
}
