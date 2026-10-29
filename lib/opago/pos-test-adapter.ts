import { F3ContractTestBackend } from './test-adapter';
import { OpagoAccount } from './account';
import { OpagoApi, OpagoError, type Request } from './api';
import { assertPosLinkReference, type PosLinkReview, type PosLinkReference, type PosLinkSource } from './pos-link';
import type { ActionProof, Challenge, Pos } from './contract-types';
import type { WalletAuthIntent } from '../wallet-auth-proof';
import type { PrivateStore } from './store';

type TestProof = { intent: WalletAuthIntent; walletId: string; expiresAt: number; used: boolean };
type Result = { status: number; body: unknown; authenticated: true };
type State = { reviews: PosLinkReview[]; challenges: [string, WalletAuthIntent][]; proofs: [string, TestProof][];
  results: [string, { fingerprint: string; result: Result }][] };
/** Local F4 simulation, never an HTTP server. QR/review/list/operator controls
 * below are test-only ports, not additions to the 0.2.0 API contract. */
export class F4ContractTestBackend extends F3ContractTestBackend implements PosLinkSource {
  reviews: PosLinkReview[] = [];
  private posChallenges = new Map<string, WalletAuthIntent>();
  private posProofs = new Map<string, TestProof>();
  private results = new Map<string, { fingerprint: string; result: Result }>();
  private queue: Promise<unknown> = Promise.resolve();
  bindingWrites = 0;
  loseNextBindingResponse = false;
  expireSessionOnce = false;
  reviewUnavailable = false;
  constructor(store: PrivateStore, uuid: () => string, network: 'mainnet' | 'regtest', now: () => number = Date.now) { super(store, uuid, network, now); }
  override createAccount() { return new OpagoAccount(new OpagoApi(this), this.store, this.identity, this.login, this.uuid, this.now, async () => {}); }
  private serial<T>(work: () => Promise<T>) { const next = this.queue.catch(() => undefined).then(work); this.queue = next; return next; }
  private async persistPos() {
    await this.store.write('f4.test.backend', { reviews: this.reviews, challenges: [...this.posChallenges], proofs: [...this.posProofs], results: [...this.results] } satisfies State);
  }
  override async load() {
    await super.load(); const state = await this.store.read<State>('f4.test.backend'); if (!state) return;
    this.reviews = state.reviews; this.posChallenges = new Map(state.challenges); this.posProofs = new Map(state.proofs); this.results = new Map(state.results);
  }
  /** Simulated operator starts a fresh 5-minute intent; wallet cannot call this in live mode. */
  async operatorStart(posId = 'pos-abcdefghij', walletId = this.state.wallet.wallet_id) {
    return this.serial(async () => {
      const previous = [...this.reviews].reverse().find(r => r.pos.pos_id === posId);
      const pos: Pos = previous ? { ...previous.pos } : { pos_id: posId, address: posId + '@opago.com', binding_version: 0, wallet_id: null, status: 'unbound' };
      const review: PosLinkReview = { intent: { pos_id: posId, binding_intent_id: this.uuid(), wallet_id: walletId,
        binding_version: pos.binding_version + 1, expires_at: this.time(300_000), operator_confirmed: false, recipient_confirmed: false },
        pos, merchant: { id: 'synthetic-merchant', name: 'Local test merchant' },
        receiver: { wallet_id: walletId, wallet_pubkey: this.state.wallet.wallet_pubkey, network: this.network, address: this.state.wallet.address?.address || 'local-test@opago.com' }, state: 'open' };
      this.reviews.push(review); await this.persistPos(); return 'opago-pos-test:' + review.intent.binding_intent_id;
    });
  }
  decodeQr(input: string): PosLinkReference | null {
    // Deliberately not an OPAGO universal/deep link or contractual production QR.
    const match = /^opago-pos-test:([0-9a-f-]{36})$/.exec(input);
    const review = match && this.reviews.find(r => r.intent.binding_intent_id === match[1]);
    if (!review) return null;
    const ref = { pos_id: review.intent.pos_id, binding_intent_id: review.intent.binding_intent_id }; assertPosLinkReference(ref); return ref;
  }
  private checkBearer(bearer: string) {
    if (!bearer.startsWith('test-wallet-access-') || this.state.deletion || this.state.wallet.status !== 'active') throw new OpagoError('session_expired');
  }
  async review(ref: PosLinkReference, bearer: string): Promise<PosLinkReview> {
    this.checkBearer(bearer); if (this.reviewUnavailable) throw new OpagoError('upstream_unavailable', true);
    const review = this.reviews.find(r => r.intent.pos_id === ref.pos_id && r.intent.binding_intent_id === ref.binding_intent_id);
    if (!review) throw new OpagoError('not_found');
    if (review.intent.wallet_id !== this.state.wallet.wallet_id) throw new OpagoError('pos_wrong_wallet');
    const result = JSON.parse(JSON.stringify(review)) as PosLinkReview;
    if (result.state === 'open' && Date.parse(result.intent.expires_at) <= this.now()) result.state = 'expired';
    return result;
  }
  async list(bearer: string) {
    this.checkBearer(bearer);
    return this.reviews.filter((r, i, all) => r.pos.wallet_id === this.state.wallet.wallet_id && !all.slice(i + 1).some(x => x.pos.pos_id === r.pos.pos_id))
      .map(r => ({ pos: { ...r.pos }, merchant: { ...r.merchant } }));
  }
  async operatorConfirm(id: string) {
    await this.serial(async () => {
      const review = this.reviews.find(r => r.intent.binding_intent_id === id);
      if (!review || review.state !== 'open' || Date.parse(review.intent.expires_at) <= this.now()) throw new OpagoError('pos_intent_used');
      review.intent.operator_confirmed = true; this.commitIfBoth(review); await this.persistPos();
    });
  }
  async competingBinding(id: string) {
    await this.serial(async () => {
      const review = this.reviews.find(r => r.intent.binding_intent_id === id)!;
      review.pos.binding_version++; review.pos.wallet_id = this.uuid(); review.state = 'superseded'; await this.persistPos();
    });
  }
  private commitIfBoth(review: PosLinkReview) {
    if (review.intent.operator_confirmed && review.intent.recipient_confirmed) {
      if (review.pos.binding_version !== review.intent.binding_version - 1) throw new OpagoError('revision_conflict');
      review.pos = { ...review.pos, binding_version: review.intent.binding_version, wallet_id: review.intent.wallet_id, status: 'active' }; review.state = 'linked';
    }
  }
  override request(req: Request): Promise<Result> { return this.serial(() => this.requestOnce(req)); }
  private async requestOnce(req: Request): Promise<Result> {
    const body = req.body as Record<string, unknown>;
    if (req.path.endsWith('/bindings')) {
      this.calls.push(JSON.parse(JSON.stringify(req)));
      if (this.expireSessionOnce) { this.expireSessionOnce = false; return this.error('session_expired', 401); }
      try { this.checkBearer(req.bearer || ''); } catch { return this.error('session_expired', 401); }
      if (req.method !== 'POST' || req.auth !== 'wallet') return this.error('forbidden', 403);
      const key = req.path + req.idempotencyKey; const fingerprint = JSON.stringify(body); const cached = this.results.get(key);
      if (cached) return cached.fingerprint === fingerprint ? cached.result : this.error('idempotency_conflict');
      const review = this.reviews.find(r => r.intent.binding_intent_id === body.binding_intent_id && req.path === '/api/v2/pos/' + r.intent.pos_id + '/bindings');
      const proof = this.posProofs.get(String(body.proof_token));
      if (!review || review.state !== 'open' || review.intent.recipient_confirmed || Date.parse(review.intent.expires_at) <= this.now()) return this.error('challenge_invalid', 401);
      if (!proof || proof.used || proof.expiresAt <= this.now() || proof.intent.action !== 'pos_bind' || proof.walletId !== review.intent.wallet_id ||
          proof.intent.action_params.pos_id !== review.intent.pos_id || proof.intent.action_params.binding_intent_id !== review.intent.binding_intent_id ||
          proof.intent.action_params.binding_version !== review.intent.binding_version) return this.error('action_mismatch', 401);
      if (review.pos.binding_version !== review.intent.binding_version - 1) return this.error('revision_conflict');
      if (!this.state.wallet.photo_match?.active_approval_revision || this.state.wallet.address?.status !== 'active') return this.error('kyc_required', 403);
      proof.used = true; review.intent.recipient_confirmed = true; this.bindingWrites++; this.commitIfBoth(review);
      const result: Result = { status: 200, authenticated: true, body: { ...review.pos } };
      this.results.set(key, { fingerprint, result }); await this.persistPos();
      if (this.loseNextBindingResponse) { this.loseNextBindingResponse = false; throw new Error('Synthetic lost response after commit'); }
      return result;
    }
    const result = await super.request(req);
    if (result.status < 300 && req.path.endsWith('/auth/challenge') && body.action === 'pos_bind') this.posChallenges.set((result.body as Challenge).challenge_id, { action: 'pos_bind', action_params: body.action_params } as WalletAuthIntent);
    if (result.status < 300 && req.path.endsWith('/auth/verify')) {
      const intent = this.posChallenges.get(String(body.challenge_id)); const proof = result.body as ActionProof;
      if (intent && proof.kind === 'proof') this.posProofs.set(proof.proof_token, { intent, walletId: proof.wallet_id, expiresAt: Date.parse(proof.expires_at), used: false });
    }
    await this.persistPos(); return result;
  }
  private error(code: string, status = 409): Result {
    return { status, authenticated: true, body: { error: { code, message: 'Local F4 test error', retryable: false, details: {} }, request_id: this.uuid() } };
  }
}
