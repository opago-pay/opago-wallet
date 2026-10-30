import { schnorr } from '@noble/curves/secp256k1';
import { bytesToHex } from '@noble/hashes/utils';
import { walletAuthChallengeDigest, signWalletAuthChallenge, type WalletAuthChallenge, type WalletAuthVerifyRequest } from '../wallet-auth-proof';
import { sessionTimestamp, sessionUuid, type V3SessionSigner } from '../wallet-session-proof';
import { isRuntimePosId } from './pos-runtime-profile';

export type PosRecipientContext = {
  accountSubject: string; walletId: string; walletPubkey: string; installationId: string;
  network: 'mainnet' | 'regtest';
};
export type PosRecipientRequest = PosRecipientContext & {
  posId: string; bindingIntentId: string; bindingVersion: number; expiresAt: string;
  /** Local correlation supplied by the authenticated channel, not a public family ID. */
  localSessionRef: string;
  challenge: WalletAuthChallenge;
};
export interface PosRecipientChannel {
  /** Integration must authenticate origin, caller and session/installation binding
   * before returning. A decoded QR, callback URL or caller-supplied boolean is NOT
   * an implementation. No production adapter is installed by this module. */
  verifiedRequest(): Promise<PosRecipientRequest>;
  assertCurrent(): void;
  /** Return only signature fields to the authenticated initiating channel. This
   * is not POST /bindings and its acknowledgement never proves binding complete. */
  returnSignature(request: PosRecipientRequest, signature: WalletAuthVerifyRequest): Promise<void>;
}
type Phase = 'empty' | 'review' | 'signing' | 'returning' | 'unknown' | 'signature_returned' | 'declined';
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const intent = (r: PosRecipientRequest) => ({ action: 'pos_bind' as const,
  action_params: { pos_id: r.posId, binding_intent_id: r.bindingIntentId, binding_version: r.bindingVersion } });
const fingerprint = (r: PosRecipientRequest) => JSON.stringify([r.accountSubject, r.walletId, r.walletPubkey, r.installationId,
  r.network, r.posId, r.bindingIntentId, r.bindingVersion, r.expiresAt, r.localSessionRef,
  r.challenge.challenge_id, r.challenge.message, r.challenge.expires_at]);

/** Wallet-side consent and signing ONLY. No account APIs, tokens, POS credentials,
 * proof-verification, confirmation, list/status or unlink capability exists here. */
export class PosRecipientApproval {
  private request: PosRecipientRequest | null = null;
  private signature: WalletAuthVerifyRequest | null = null;
  private state: Phase = 'empty';
  private generation = 0;
  private busy = false;
  private readonly context: PosRecipientContext;
  constructor(context: PosRecipientContext, private readonly channel: PosRecipientChannel,
    private readonly signer: V3SessionSigner, private readonly authorize: () => Promise<() => void>,
    private readonly now = () => Date.now()) {
    this.context = { ...context };
  }
  get phase(): Phase { return this.state; }
  get review(): PosRecipientRequest | null { return this.request && copy(this.request); }
  private validate(r: PosRecipientRequest) {
    const c = this.context;
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).sort().join(',') !==
        'accountSubject,bindingIntentId,bindingVersion,challenge,expiresAt,installationId,localSessionRef,network,posId,walletId,walletPubkey' ||
        !r.challenge || Object.keys(r.challenge).sort().join(',') !== 'challenge_id,expires_at,message') throw new Error('Invalid POS signature request');
    if (!sessionUuid(c.accountSubject) || !sessionUuid(c.walletId) || !sessionUuid(c.installationId) ||
        !/^0[23][0-9a-f]{64}$/.test(c.walletPubkey) || !['mainnet', 'regtest'].includes(c.network) ||
        r.accountSubject !== c.accountSubject || r.walletId !== c.walletId || r.walletPubkey !== c.walletPubkey ||
        r.installationId !== c.installationId || r.network !== c.network ||
        !isRuntimePosId(r.posId) || !sessionUuid(r.bindingIntentId) || !Number.isSafeInteger(r.bindingVersion) || r.bindingVersion < 1 ||
        typeof r.localSessionRef !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(r.localSessionRef)) throw new Error('POS recipient context mismatch');
    const expiry = sessionTimestamp(r.expiresAt);
    if (expiry <= this.now() || expiry > this.now() + 300_000) throw new Error('POS request expired');
    // The 0.2.0 signature does not contain installation/account IDs. The verified
    // channel MUST establish those bindings; validating action bytes alone cannot.
    walletAuthChallengeDigest(r.challenge, intent(r), c.network, Uint8Array.from(c.walletPubkey.match(/../g)!.map(b => parseInt(b, 16))), this.now());
  }
  private async exclusive<T>(operation: (current: () => void) => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('POS approval in progress');
    this.busy = true; const generation = this.generation;
    const current = () => { if (generation !== this.generation) throw new Error('POS approval cancelled'); this.channel.assertCurrent(); };
    try { current(); return await operation(current); } finally { this.busy = false; }
  }
  async loadReview(): Promise<void> {
    return this.exclusive(async current => {
      if (['signing', 'returning', 'unknown'].includes(this.state)) throw new Error('Recover or clear the existing signature first');
      const r = copy(await this.channel.verifiedRequest()); current(); this.validate(r);
      this.request = r; this.signature = null; this.state = 'review';
    });
  }
  async approve(): Promise<void> {
    return this.exclusive(async current => {
      if (this.state !== 'review' || !this.request) throw new Error('POS review required');
      const r = this.request;
      const latest = copy(await this.channel.verifiedRequest()); current(); this.validate(latest);
      if (fingerprint(latest) !== fingerprint(r)) throw new Error('POS request changed; review again');
      this.state = 'signing';
      try {
        const consent = await this.authorize(); const approved = () => { current(); consent(); this.validate(r); };
        approved();
        const key = await this.signer.getIdentityPublicKey(); approved();
        if (bytesToHex(key) !== r.walletPubkey) throw new Error('POS signer mismatch');
        const guardedSigner: V3SessionSigner = {
          getIdentityPublicKey: async () => { approved(); const value = await this.signer.getIdentityPublicKey(); approved(); return value; },
          signSchnorrWithIdentityKey: async digest => { approved(); const value = await this.signer.signSchnorrWithIdentityKey(digest); approved(); return value; },
        };
        const signature = await signWalletAuthChallenge(guardedSigner, r.challenge, intent(r), r.network, r.installationId, this.now());
        approved();
        if (!schnorr.verify(signature.signature, walletAuthChallengeDigest(r.challenge, intent(r), r.network, key, this.now()), key.slice(1))) throw new Error('Invalid POS signature');
        this.signature = signature;
        await this.send(r, signature, approved);
      } catch (error) {
        // Clear/lock must not be undone by a late failure continuation.
        current(); if (this.state === 'signing') this.state = 'review'; throw error;
      }
    });
  }
  async recoverSignatureReturn(): Promise<void> {
    return this.exclusive(async current => {
      if (this.state !== 'unknown' || !this.request || !this.signature) throw new Error('No signature return to recover');
      const latest = copy(await this.channel.verifiedRequest()); current(); this.validate(latest);
      if (fingerprint(latest) !== fingerprint(this.request)) throw new Error('POS request changed');
      await this.send(this.request, this.signature, current);
    });
  }
  private async send(r: PosRecipientRequest, signature: WalletAuthVerifyRequest, current: () => void) {
    current(); this.validate(r); this.state = 'returning';
    try {
      await this.channel.returnSignature(copy(r), { ...signature }); current();
      this.state = 'signature_returned'; // Never "linked": only the POS confirms.
    } catch (error) { current(); this.state = 'unknown'; throw error; }
  }
  decline(): void {
    if (this.busy || this.state !== 'review') throw new Error('POS review required');
    this.signature = null; this.state = 'declined';
  }
  /** Native lifecycle must call on lock/background/account change. No server revoke. */
  clear(): void { this.generation++; this.signature = null; this.request = null; this.state = 'empty'; }
}
