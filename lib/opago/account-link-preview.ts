/**
 * UI-only F3 integration seam. The live F3 AccountLogin / WalletIdentity
 * implementations remain the source of truth; no production endpoint is called.
 */
export const ACCOUNT_LINK_PREVIEW_ENABLED = false;

export type LinkFailure = 'conflict' | 'challenge_expired' | 'network' | 'cancelled';
export type LinkStatus = { accountId: string | null; walletId: string | null; linked: boolean };
export type LinkChallenge = { id: string; accountId: string; walletId: string; expiresAt: number };
export interface AccountLinkPreviewAdapter {
  login(): Promise<string | null>;
  status(accountId: string): Promise<LinkStatus>;
  challenge(accountId: string, walletId: string): Promise<LinkChallenge>;
  verify(challenge: LinkChallenge, signature: string): Promise<LinkStatus>;
  unlink(accountId: string): Promise<void>;
}
export interface SparkIdentityProof {
  /** Must sign the binding challenge using the existing Spark Identity Key. */
  sign(challenge: LinkChallenge): Promise<string>;
}
export class LinkPreviewError extends Error {
  constructor(readonly code: LinkFailure) { super(code); }
}
export class MockAccountLinkAdapter implements AccountLinkPreviewAdapter {
  private owner: string | null = null;
  private pending: LinkChallenge | null = null;
  constructor(private readonly walletId: string, private readonly now = Date.now) {}
  async login() { return 'mock-opago-account'; }
  async status(accountId: string): Promise<LinkStatus> {
    return { accountId, walletId: this.owner === accountId ? this.walletId : null, linked: this.owner === accountId };
  }
  async challenge(accountId: string, walletId: string): Promise<LinkChallenge> {
    if (walletId !== this.walletId || (this.owner && this.owner !== accountId)) throw new LinkPreviewError('conflict');
    this.pending = { id: String(this.now()) + ':' + accountId, accountId, walletId, expiresAt: this.now() + 60_000 };
    return this.pending;
  }
  async verify(challenge: LinkChallenge, signature: string): Promise<LinkStatus> {
    if (!this.pending || this.pending.id !== challenge.id || this.now() >= challenge.expiresAt) throw new LinkPreviewError('challenge_expired');
    if (!signature.trim()) throw new LinkPreviewError('cancelled');
    if (this.owner && this.owner !== challenge.accountId) throw new LinkPreviewError('conflict');
    this.owner = challenge.accountId;
    this.pending = null;
    return this.status(challenge.accountId);
  }
  async unlink(accountId: string) {
    if (this.owner === accountId) this.owner = null;
    this.pending = null;
  }
}
/** Never replace a real Spark signature with a synthetic proof in production. */
export async function linkWithSparkProof(adapter: AccountLinkPreviewAdapter, signer: SparkIdentityProof, accountId: string, walletId: string) {
  const challenge = await adapter.challenge(accountId, walletId);
  const signature = await signer.sign(challenge);
  return adapter.verify(challenge, signature);
}
