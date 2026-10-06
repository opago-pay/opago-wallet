import { OpagoAccount, photoMatchReady } from './account';
import { OpagoError } from './api';
import { assertContract } from './contract';
import type { ActionProof, Pos, PosBindingIntent } from './contract-types';
import { isValidPosLinkReference, type PosLinkReference } from './pos-link-reference';

export type { PosLinkReference } from './pos-link-reference';
/** Required authoritative data boundary. 0.2.0 does NOT define wallet-readable
 * intent/status/list routes, merchant details or a QR format. No URLs are inferred
 * from a scan. A reviewed backend integration must supply this port. */
export type PosLinkReview = {
  intent: PosBindingIntent; pos: Pos;
  merchant: { id: string; name: string };
  receiver: { wallet_id: string; wallet_pubkey: string; network: 'mainnet' | 'regtest'; address: string };
  state: 'open' | 'linked' | 'expired' | 'superseded' | 'rejected';
};
export type PosLinkListing = { pos: Pos; merchant: PosLinkReview['merchant'] };
export interface PosLinkSource {
  readonly mode: 'backend' | 'contract-test';
  decodeQr(input: string): PosLinkReference | null;
  review(reference: PosLinkReference, walletBearer: string): Promise<PosLinkReview>;
  list(walletBearer: string): Promise<PosLinkListing[]>;
}
type Phase = 'review' | 'confirming' | 'unknown' | 'awaiting_operator' | 'linked' | 'declined' | 'expired' | 'superseded' | 'rejected';
type Saved = { review: PosLinkReview; phase: Phase };
export function assertPosLinkReference(value: PosLinkReference) {
  if (!isValidPosLinkReference(value)) throw new OpagoError('pos_qr_invalid');
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value);
const frozen = (review: PosLinkReview) => JSON.stringify([review.intent.pos_id, review.intent.binding_intent_id,
  review.intent.wallet_id, review.intent.binding_version, review.intent.expires_at, review.merchant.id, review.merchant.name,
  review.receiver.wallet_id, review.receiver.wallet_pubkey, review.receiver.network, review.receiver.address, review.pos.address]);
const terminal = (phase: Phase) => ['linked', 'declined', 'expired', 'superseded', 'rejected'].includes(phase);

export class PosLinking {
  current: Saved | null = null;
  verified = false;
  links: PosLinkListing[] | null = null;
  private readonly key: string;
  constructor(readonly account: OpagoAccount, readonly source?: PosLinkSource) {
    this.key = account.operationKey('pos.snapshot');
    if (source && (source.mode === 'contract-test') !== (account.api.transport.mode === 'contract-test')) throw new Error('Test and live POS sources cannot be mixed.');
  }
  get available() { return !!this.source; }
  get phase(): Phase | null {
    if (this.current?.phase === 'review' && Date.parse(this.current.review.intent.expires_at) <= this.account.now()) return 'expired';
    return this.current?.phase || null;
  }
  get canApprove() { return this.verified && this.phase === 'review'; }
  get needsRecovery() { return ['confirming', 'unknown'].includes(this.current?.phase || ''); }
  private flow() { return 'pos.' + this.current!.review.intent.binding_intent_id; }
  private async save() { await this.account.store.write(this.key, this.current); }
  async load() { this.current = await this.account.store.read<Saved>(this.key); this.verified = false; this.links = null; }
  private requireSource() { if (!this.source) throw new OpagoError('pos_integration_unavailable'); return this.source; }
  decode(input: string): PosLinkReference {
    if (!input || input.length > 4096 || input !== input.trim()) throw new OpagoError('pos_qr_invalid');
    const reference = this.requireSource().decodeQr(input);
    if (!reference) throw new OpagoError('pos_qr_invalid');
    assertPosLinkReference(reference); return reference;
  }
  private validate(review: PosLinkReview, reference: PosLinkReference) {
    assertContract<PosBindingIntent>('PosBindingIntent', review.intent); assertContract<Pos>('Pos', review.pos);
    const wallet = this.account.state.wallet;
    if (!wallet || review.intent.wallet_id !== wallet.wallet_id || review.receiver.wallet_id !== wallet.wallet_id ||
        review.receiver.wallet_pubkey !== wallet.wallet_pubkey || review.receiver.network !== wallet.network) throw new OpagoError('pos_wrong_wallet');
    if (wallet.address && review.receiver.address !== wallet.address.address) throw new OpagoError('pos_details_invalid');
    if (review.intent.pos_id !== reference.pos_id || review.intent.binding_intent_id !== reference.binding_intent_id ||
        review.pos.pos_id !== reference.pos_id || !text(review.merchant.id) || !text(review.merchant.name) || !text(review.receiver.address) ||
        !['open', 'linked', 'expired', 'superseded', 'rejected'].includes(review.state) ||
        Date.parse(review.intent.expires_at) > this.account.now() + 300_000) throw new OpagoError('pos_details_invalid');
    if (review.state === 'linked' && (!review.intent.operator_confirmed || !review.intent.recipient_confirmed ||
        review.pos.wallet_id !== wallet.wallet_id || review.pos.status !== 'active' || review.pos.binding_version !== review.intent.binding_version)) throw new OpagoError('pos_details_invalid');
    if (review.state === 'open' && review.pos.binding_version !== review.intent.binding_version - 1) throw new OpagoError('pos_binding_changed');
  }
  private async fetch(reference: PosLinkReference) {
    const source = this.requireSource(); await this.account.refresh();
    const review = await source.review(reference, (await this.account.bearer('wallet'))!);
    this.validate(review, reference); return copy(review);
  }
  async scan(input: string) {
    // Retain unknown outcomes and pending two-sided consent across scans/restarts.
    if (this.current?.phase === 'review' && Date.parse(this.current.review.intent.expires_at) <= this.account.now()) {
      this.current.phase = 'expired'; await this.save(); await this.account.finish(this.flow() + '.challenge');
    }
    if (this.current && !terminal(this.current.phase)) throw new OpagoError('operation_conflict');
    this.verified = false;
    const reference = this.decode(input); const review = await this.fetch(reference);
    if (review.state !== 'open' || review.intent.recipient_confirmed || Date.parse(review.intent.expires_at) <= this.account.now()) throw new OpagoError('pos_intent_used');
    this.current = { review, phase: 'review' }; this.verified = true; await this.save();
  }
  async refresh() {
    if (!this.current) return;
    this.verified = false;
    const previous = this.current; const review = await this.fetch({ pos_id: previous.review.intent.pos_id, binding_intent_id: previous.review.intent.binding_intent_id });
    if (frozen(review) !== frozen(previous.review)) throw new OpagoError('pos_binding_changed');
    let phase = previous.phase;
    if (phase !== 'declined') {
      if (review.state !== 'open') phase = review.state;
      else if (Date.parse(review.intent.expires_at) <= this.account.now() && !this.needsRecovery) phase = 'expired';
      else if (review.intent.recipient_confirmed) phase = 'awaiting_operator';
    }
    this.current = { review, phase }; this.verified = true; await this.save();
    // Only authoritative outcome permits forgetting a dispatched mutation.
    if (terminal(phase) || review.intent.recipient_confirmed) await this.account.finish(this.flow() + '.challenge', this.flow() + '.verify', this.flow() + '.commit');
  }
  async approve() {
    if (!this.canApprove) throw new OpagoError('pos_review_required');
    // Re-read immediately before consent: merchant/receiver/version cannot change.
    await this.refresh();
    if (!this.canApprove) throw new OpagoError('pos_intent_used');
    const wallet = this.account.state.wallet;
    if (!photoMatchReady(wallet) || wallet?.status !== 'active' || wallet.address?.status !== 'active') throw new OpagoError('kyc_required');
    this.current!.phase = 'confirming'; await this.save(); // Explicit consent before any proof/request.
    await this.commit();
  }
  async recover() {
    if (!this.needsRecovery) throw new OpagoError('pos_review_required');
    await this.refresh();
    if (!this.needsRecovery) return;
    await this.commit(); // Same proof input/bytes and durable mutation key, even after expiry.
  }
  private async commit() {
    const review = this.current!.review; const intent = review.intent; const flow = this.flow();
    try {
      const proof = await this.account.proof({ action: 'pos_bind', action_params: {
        pos_id: intent.pos_id, binding_intent_id: intent.binding_intent_id, binding_version: intent.binding_version,
      } }, 'wallet', flow) as ActionProof;
      if (proof.wallet_id !== intent.wallet_id) throw new OpagoError('pos_wrong_wallet');
      const pos = await this.account.mutate<Pos>(flow + '.commit', 'POST', '/api/v2/pos/' + intent.pos_id + '/bindings', {
        binding_intent_id: intent.binding_intent_id, proof_token: proof.proof_token,
      }, 'wallet');
      if (pos.pos_id !== intent.pos_id || (pos.binding_version !== intent.binding_version - 1 &&
          (pos.binding_version !== intent.binding_version || pos.wallet_id !== intent.wallet_id))) throw new OpagoError('pos_details_invalid');
      // Pos alone cannot attest both consents. Only an authoritative status can.
      this.current!.phase = 'awaiting_operator'; await this.save(); await this.refresh();
    } catch (error) {
      if (this.current && !terminal(this.current.phase)) {
        const verified = await this.account.store.read(this.account.operationKey(flow + '.verify'));
        const commit = await this.account.store.read(this.account.operationKey(flow + '.commit'));
        const cancelledBeforeDispatch = error instanceof Error && /cancelled/i.test(error.message) && !verified && !commit;
        const commitAcknowledged = !!commit && typeof commit === 'object' && Object.hasOwn(commit, 'result');
        const definitive = !commitAcknowledged && error instanceof OpagoError && !error.retryable &&
          ['challenge_invalid', 'challenge_expired', 'signature_invalid', 'action_mismatch', 'revision_conflict', 'account_mismatch', 'pos_wrong_wallet', 'kyc_required', 'wallet_closed', 'account_deleted', 'forbidden'].includes(error.code);
        this.current.phase = cancelledBeforeDispatch ? 'review' : definitive ? 'rejected' : 'unknown';
        this.verified = false; await this.save();
        if (definitive) await this.account.finish(flow + '.challenge', flow + '.verify', flow + '.commit');
      }
      throw error;
    }
  }
  async decline() {
    if (!this.current || this.current.phase !== 'review') throw new OpagoError('pos_review_required');
    this.current.phase = 'declined'; this.verified = false; await this.save();
    await this.account.finish(this.flow() + '.challenge');
    // Local refusal only: contract 0.2.0 has no reject/cancel endpoint.
  }
  async list() {
    this.links = null; const source = this.requireSource(); await this.account.refresh();
    const links = await source.list((await this.account.bearer('wallet'))!);
    if (!Array.isArray(links) || links.length > 500) throw new OpagoError('pos_details_invalid');
    const seen = new Set<string>();
    for (const link of links) {
      assertContract<Pos>('Pos', link.pos);
      if (link.pos.wallet_id !== this.account.state.wallet!.wallet_id || !text(link.merchant.id) || !text(link.merchant.name) || seen.has(link.pos.pos_id)) throw new OpagoError('pos_details_invalid');
      seen.add(link.pos.pos_id);
    }
    this.links = copy(links);
  }
}
