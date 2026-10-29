import { OpagoAccount } from './account';
import { OpagoError, type Request } from './api';
import { assertContract } from './contract';
import type { PhotoMatch, PhotoMatchFields, PhotoDescriptor, PhotoUploadResult, Wallet } from './contract-types';
import { jcs, utf8 } from './encoding';
import { inspectPhoto, photoHash } from './identity-media';

export const emptyIdentity = (): PhotoMatchFields => ({ given_name: '', family_name: '', date_of_birth: '', document_number: '',
  document_expiry: '', nationality: '', contact_email: '', document_type: 'passport' });
export function validateIdentity(fields: PhotoMatchFields): (keyof PhotoMatchFields)[] {
  const errors: (keyof PhotoMatchFields)[] = [];
  for (const key of Object.keys(emptyIdentity()) as (keyof PhotoMatchFields)[]) {
    try { assertContract('PhotoMatchFields', { ...emptyIdentity(), given_name: 'A', family_name: 'B', date_of_birth: '2000-01-01',
      document_number: 'TEST123', document_expiry: '2030-01-01', nationality: 'DEU', contact_email: 'synthetic@example.test', [key]: fields[key] }); }
    catch { errors.push(key); }
    if (typeof fields[key] !== 'string' || !fields[key].trim() || /[\u0000-\u001f\u007f]/.test(fields[key]) ||
        key === 'contact_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields[key])) {
      if (!errors.includes(key)) errors.push(key);
    }
  }
  return errors;
}
export type IdentityPhoto = { bytes: Uint8Array; uri: string; side: 'front' | 'back' };
type Pending = { key: string; request: Omit<Request,'bearer'|'photo'>; retryAt?: number; error?: string };
type Saved = { fields: PhotoMatchFields; snapshot: PhotoMatch | null; pending?: Pending; nextReadAt?: number; discardedSubmissionId?: string };
const safeClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
/** Only public 0.2.0 intake operations. No OCR/approval engine or hidden re-submission. */
export class IdentityIntake {
  fields = emptyIdentity(); snapshot: PhotoMatch | null = null; pending: Pending | undefined;
  private discardedSubmissionId: string | undefined;
  get needsRecovery() { return !!this.pending || !!this.discardedSubmissionId; }
  private nextReadAt = 0;
  private readonly slot: string;
  private readonly owner: string;
  constructor(readonly account: OpagoAccount, private readonly current: () => void = () => {}) {
    this.owner = this.scope(); this.slot = 'p3.intake.' + photoHash(utf8(this.owner));
  }
  private scope() { const a = this.account; return jcs({ mode: a.api.transport.mode, environment: a.api.transport.audience || a.api.transport.mode, wallet: a.state.session?.wallet_id || '',
    key: a.identity.publicKey, network: a.identity.network, installation: a.installationId,
    subject: a.state.credential?.subject || '', generation: a.state.syncGeneration || 0 }); }
  guard() { this.current(); if (this.owner !== this.scope() || this.account.state.deletion ||
    this.account.state.syncPaused || !this.account.state.session || this.account.state.wallet?.status === 'closed' ||
    this.account.state.wallet?.status === 'deleted') throw new OpagoError('identity_owner_changed'); }
  private async checked<T>(work: () => Promise<T>): Promise<T> { this.guard(); const value = await work(); this.guard(); return value; }
  async load() {
    const saved = await this.checked(() => this.account.store.read<Saved>(this.slot));
    if (saved) { if (Object.keys(saved.fields).length !== 8 || Object.entries(saved.fields).some(([k,v]) => !(k in emptyIdentity()) || typeof v !== 'string' || v.length > 254)) throw new OpagoError('invalid_request'); this.fields = saved.fields;
      if (saved.snapshot) assertContract('PhotoMatch', saved.snapshot); this.snapshot = saved.snapshot; this.pending = saved.pending; this.nextReadAt = saved.nextReadAt || 0; this.discardedSubmissionId = saved.discardedSubmissionId; }
    if (this.discardedSubmissionId) { await this.reconcileDiscard(); return; }
    const id = this.pending?.request.path === '/api/v2/onboarding/kyc' ? (this.pending.request.body as { submission_id: string }).submission_id :
      this.pending?.request.path.split('/')[5] || this.snapshot?.submission_id || this.account.state.wallet?.photo_match?.submission_id;
    if (id && /^[0-9a-f-]{36}$/i.test(id)) await this.refresh(id);
    if (!saved && this.snapshot) this.fields = safeClone(this.snapshot.fields);
  }
  private async save() {
    await this.checked(() => this.account.store.write(this.slot, { fields: this.fields, snapshot: this.snapshot, nextReadAt: this.nextReadAt,
      ...(this.pending ? { pending: this.pending } : {}), ...(this.discardedSubmissionId ? { discardedSubmissionId: this.discardedSubmissionId } : {}) }));
    await this.checked(() => this.account.save());
  }
  async edit(fields: PhotoMatchFields) {
    this.guard(); if (this.needsRecovery) throw new OpagoError('identity_outcome_unknown');
    // Draft can contain incomplete fields, but never arbitrary extras/oversized input.
    if (Object.keys(fields).length !== 8 || Object.entries(fields).some(([k,v]) => !(k in emptyIdentity()) || typeof v !== 'string' || v.length > 254)) throw new OpagoError('invalid_request');
    this.fields = safeClone(fields); await this.save();
  }
  private accept(value: PhotoMatch) {
    assertContract<PhotoMatch>('PhotoMatch',value);
    if (this.snapshot && value.submission_id !== this.snapshot.submission_id) throw new OpagoError('account_mismatch');
    if (this.snapshot && (value.revision < this.snapshot.revision || value.revision === this.snapshot.revision &&
        (value.edit_version < this.snapshot.edit_version || Date.parse(value.updated_at) < Date.parse(this.snapshot.updated_at)))) return false;
    this.snapshot = safeClone(value);
    if (this.account.state.wallet) {
      const { fields: _fields, documents: _documents, edit_version: _edit, contact_verification_required: _contact, ...summary } = value;
      this.account.state.wallet.photo_match = safeClone(summary);
    }
    return true;
  }
  async refresh(id = this.snapshot?.submission_id) {
    if (!id) return;
    const p = this.pending;
    if (this.nextReadAt > this.account.now() || p?.retryAt && p.retryAt > this.account.now()) throw new OpagoError('retry_later');
    try {
      const value = await this.checked(async () => this.account.api.call<PhotoMatch>({ method: 'GET', path: '/api/v2/onboarding/kyc/' + id,
        body: {}, auth: 'wallet', bearer: await this.checked(() => this.account.bearer('wallet')) }));
      if (!this.accept(value)) return;
      if (p && this.provesCommitted(p,value)) this.pending = undefined;
      await this.save();
    } catch (cause) {
      if (cause instanceof OpagoError && cause.code === 'not_found' && p?.request.method === 'POST' && p.request.path === '/api/v2/onboarding/kyc') return;
      if (cause instanceof OpagoError && cause.code === 'not_found' && p?.request.method === 'DELETE') {
        this.pending = undefined; this.discardedSubmissionId = id; this.snapshot = null; this.fields = emptyIdentity(); await this.save(); await this.reconcileDiscard(); return;
      }
      if (cause instanceof OpagoError && (cause.retryAfterSeconds || cause.code === 'rate_limited')) {
        this.nextReadAt = this.account.now() + Math.max(1000,cause.retryAfterSeconds * 1000); if (p) p.retryAt = this.nextReadAt; await this.save();
      }
      throw cause;
    }
  }
  private async reconcileDiscard() {
    if (this.nextReadAt > this.account.now()) throw new OpagoError('retry_later');
    // DELETE returns only Ok. Read the wallet rather than guessing whether an older
    // approved revision is restored or the initial draft has simply disappeared.
    try {
      const wallet = await this.checked(async () => this.account.api.call<Wallet>({ method: 'GET', path: '/api/v2/wallet/me', body: {},
        auth: 'wallet', bearer: await this.checked(() => this.account.bearer('wallet')) }));
      this.account.checkWallet(wallet); this.account.state.wallet = wallet;
      if (wallet.photo_match) {
        this.snapshot = null; await this.refresh(wallet.photo_match.submission_id);
        this.fields = safeClone(this.snapshot!.fields);
      }
      this.discardedSubmissionId = undefined; await this.save();
    } catch (cause) {
      this.guard();
      if (cause instanceof OpagoError && (cause.retryAfterSeconds || cause.code === 'rate_limited')) {
        this.nextReadAt = this.account.now() + Math.max(1000,cause.retryAfterSeconds * 1000); await this.save();
      }
      throw cause;
    }
  }
  private provesCommitted(p: Pending, value: PhotoMatch) {
    const r = p.request; const b = r.body as Record<string,unknown>;
    if (r.path === '/api/v2/onboarding/kyc') return value.submission_id === b.submission_id && value.revision >= 1;
    if (r.method === 'PUT') return value.revision === b.revision && value.edit_version > Number(b.expected_edit_version) && jcs(value.fields) === jcs(b.fields);
    if (r.path.endsWith('/revisions')) return value.revision === Number(b.base_revision)+1;
    if (r.path.endsWith('/submit')) return value.revision === b.revision && value.status !== 'draft';
    if (r.path.includes('/documents?')) return value.documents.some(d => d.side === b.side && d.revision === b.revision && d.original_sha256 === b.original_sha256);
    return false;
  }
  private async write(request: Omit<Request,'bearer'|'photo'>, photo?: Uint8Array): Promise<void> {
    this.guard();
    if (this.pending && jcs(this.pending.request) !== jcs(request)) throw new OpagoError('identity_outcome_unknown');
    this.pending ||= { key: this.account.uuid(), request: safeClone(request) };
    if (this.pending.retryAt && this.pending.retryAt > this.account.now()) throw new OpagoError('retry_later');
    await this.save(); const pending = this.pending;
    try {
      const result = await this.checked(async () => this.account.api.call<PhotoMatch | PhotoUploadResult>({ ...request,
        bearer: await this.checked(() => this.account.bearer(request.auth)), idempotencyKey: pending.key, ...(photo ? { photo } : {}) }));
      if (request.path.includes('/documents?')) {
        const descriptor = request.body as PhotoDescriptor; const upload = result as PhotoUploadResult;
        if (upload.submission_id !== descriptor.submission_id || upload.revision !== descriptor.revision || upload.side !== descriptor.side ||
            upload.original_sha256 !== descriptor.original_sha256 || upload.edit_version <= descriptor.expected_edit_version) throw new OpagoError('identity_invalid_response');
      } else if (request.method === 'DELETE') { this.discardedSubmissionId = request.path.split('/')[5]; this.snapshot = null; this.fields = emptyIdentity(); }
      else {
        const match = result as PhotoMatch; const body = request.body as Record<string,unknown>;
        const expectedId = body.submission_id || request.path.split('/')[5];
        if (match.submission_id !== expectedId || !this.provesCommitted(pending,match)) throw new OpagoError('identity_invalid_response');
        this.accept(match);
      }
      this.pending = undefined; await this.save();
      if (request.path.includes('/documents?')) await this.refresh();
      if (request.method === 'DELETE') await this.reconcileDiscard();
    } catch (cause) {
      this.guard();
      if (cause instanceof OpagoError && !cause.retryable && ['invalid_request','document_invalid','payload_too_large','revision_conflict','kyc_state_invalid','forbidden'].includes(cause.code)) {
        this.pending = undefined; await this.save();
      } else { pending.error = cause instanceof OpagoError ? cause.code : 'identity_outcome_unknown';
        pending.retryAt = this.account.now() + Math.max(1000, cause instanceof OpagoError ? cause.retryAfterSeconds * 1000 : 1000); await this.save(); }
      throw cause;
    }
  }
  async recover(photos: IdentityPhoto[] = []) {
    if (this.discardedSubmissionId) { await this.reconcileDiscard(); return; }
    if (!this.pending) { await this.refresh(); return; }
    const saved = this.pending; const id = saved.request.path === '/api/v2/onboarding/kyc' ? (saved.request.body as { submission_id: string }).submission_id : saved.request.path.split('/')[5];
    await this.refresh(id); if (!this.pending) return;
    const descriptor = saved.request.body as PhotoDescriptor;
    const photo = saved.request.path.includes('/documents?') ? photos.find(p => p.side === descriptor.side && photoHash(p.bytes) === descriptor.original_sha256) : undefined;
    if (saved.request.path.includes('/documents?') && !photo) throw new OpagoError('identity_photo_recovery');
    await this.write(saved.request,photo?.bytes);
  }
  async newRevision() {
    const s = this.snapshot; if (!s || !['approved','correction_requested'].includes(s.status) || !this.account.state.credential) throw new OpagoError('kyc_state_invalid');
    await this.write({ method: 'POST', path: '/api/v2/onboarding/kyc/' + s.submission_id + '/revisions', auth: 'account',
      body: { base_revision: s.revision, expected_edit_version: s.edit_version } });
    this.fields = safeClone(this.snapshot!.fields); await this.save();
  }
  async submit(photos: IdentityPhoto[]) {
    this.guard(); if (validateIdentity(this.fields).length) throw new OpagoError('identity_fields_invalid');
    if (this.needsRecovery) throw new OpagoError('identity_outcome_unknown');
    const sides = this.fields.document_type === 'passport' ? ['front'] : ['front','back'];
    if (photos.length > sides.length || new Set(photos.map(p => p.side)).size !== photos.length || photos.some(p => !sides.includes(p.side))) throw new OpagoError('invalid_request');
    if (!this.snapshot) {
      if (this.account.state.session?.scope !== 'onboarding' || this.account.state.wallet?.photo_match) throw new OpagoError('kyc_state_invalid');
      await this.write({ method: 'POST', path: '/api/v2/onboarding/kyc', auth: 'wallet', body: { submission_id: this.account.uuid(), fields: this.fields } });
    }
    let s = this.snapshot!; if (s.status !== 'draft') throw new OpagoError('kyc_state_invalid');
    if (jcs(s.fields) !== jcs(this.fields)) {
      if (s.correction_fields.length && Object.keys(this.fields).some(k => this.fields[k as keyof PhotoMatchFields] !== s.fields[k as keyof PhotoMatchFields] && !s.correction_fields.includes(k as keyof PhotoMatchFields))) throw new OpagoError('revision_conflict');
      await this.write({ method: 'PUT', path: '/api/v2/onboarding/kyc/' + s.submission_id, auth: 'wallet',
        body: { revision: s.revision, expected_edit_version: s.edit_version, fields: this.fields } });
    }
    for (const photo of photos) {
      s = this.snapshot!; if (s.correction_fields.length && !s.correction_fields.includes(photo.side)) throw new OpagoError('revision_conflict');
      const image = inspectPhoto(photo.bytes); const hash = photoHash(photo.bytes);
      if (s.documents.some(d => d.side === photo.side && d.revision === s.revision && d.original_sha256 === hash)) continue;
      const descriptor: PhotoDescriptor = { submission_id: s.submission_id, revision: s.revision, side: photo.side, content_type: image.contentType,
        plaintext_length: photo.bytes.length, original_sha256: hash, expected_edit_version: s.edit_version };
      await this.write({ method: 'POST', path: '/api/v2/onboarding/kyc/' + s.submission_id + '/documents?revision=' + s.revision + '&side=' + photo.side,
        auth: 'wallet', body: descriptor },photo.bytes);
    }
    s = this.snapshot!;
    if (!(this.fields.document_type === 'passport' ? ['front'] : ['front','back']).every(side => s.documents.some(d => d.side === side && d.revision === s.revision))) throw new OpagoError('identity_photo_required');
    await this.write({ method: 'POST', path: '/api/v2/onboarding/kyc/' + s.submission_id + '/submit', auth: 'wallet',
      body: { revision: s.revision, expected_edit_version: s.edit_version } });
  }
  async discard() {
    if (this.needsRecovery) throw new OpagoError('identity_outcome_unknown');
    if (this.snapshot?.status === 'draft') await this.write({ method: 'DELETE', path: '/api/v2/onboarding/kyc/' + this.snapshot.submission_id, auth: 'wallet', body: {} });
    this.fields = emptyIdentity(); await this.save();
  }
}
