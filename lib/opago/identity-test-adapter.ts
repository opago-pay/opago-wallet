import { F4ContractTestBackend } from './pos-test-adapter';
import type { Request } from './api';
import type { PhotoMatch, PhotoMatchFields, PhotoDescriptor, PhotoUploadResult } from './contract-types';
import { inspectPhoto, photoHash } from './identity-media';
import { validateIdentity } from './identity';
import { jcs } from './encoding';
/** Explicit development-only synthetic contract backend; no network/SDK/document reader. */
export class IdentityContractTestBackend extends F4ContractTestBackend {
  photo: PhotoMatch | null = null; loseNext = false;
  private outcomes = new Map<string,{ fingerprint: string; result: { status: number; body: unknown; authenticated: true } }>();
  readonly effects: string[] = [];
  private identityFailure(code: string, status = 409) { return { status, authenticated: true as const, body: {
    error: { code, message: 'Synthetic contract error.', retryable: false, details: {} }, request_id: this.uuid() } }; }
  async setIdentityStatus(status: 'in_review'|'approved'|'correction_requested'|'rejected') {
    if (!this.photo || this.photo.status === 'draft') return;
    this.photo.status = status; this.photo.updated_at = this.time();
    this.photo.processing_status = status === 'in_review' ? 'processing' : 'completed';
    this.photo.match_result = status === 'approved' ? 'passed' : status === 'in_review' ? null : 'mismatch';
    this.photo.correction_fields = status === 'correction_requested' ? ['given_name','front'] : [];
    if (status === 'approved') this.photo.active_approval_revision = this.photo.revision;
    this.summary();
  }
  private summary() {
    if (!this.photo) { this.state.wallet.photo_match = null; return; }
    const { fields: _fields, documents: _documents, edit_version: _edit, contact_verification_required: _contact, ...summary } = this.photo;
    this.state.wallet.photo_match = summary;
  }
  async request(req: Request) {
    if (!req.path.startsWith('/api/v2/onboarding/kyc')) return super.request(req);
    if (!req.bearer || req.auth === 'account' && req.bearer !== 'test-account-token' || req.auth === 'wallet' && !req.bearer.startsWith('test-wallet-access-')) return this.identityFailure('session_expired',401);
    const cacheKey = req.method + req.path + req.idempotencyKey; const fingerprint = jcs(req.body);
    const previous = this.outcomes.get(cacheKey);
    if (previous) return previous.fingerprint === fingerprint ? JSON.parse(JSON.stringify(previous.result)) : this.identityFailure('idempotency_conflict');
    const b = req.body as Record<string,unknown>; const existing = this.photo; let output: unknown; let status = 200;
    if (req.path === '/api/v2/onboarding/kyc' && req.method === 'POST') {
      if (existing || validateIdentity(b.fields as PhotoMatchFields).length) return this.identityFailure('kyc_state_invalid');
      this.photo = { submission_id: b.submission_id as string, fields: b.fields as PhotoMatchFields, revision: 1, edit_version: 1,
        status: 'draft', active_approval_revision: null, assurance: 'photo_data_match_only', match_result: null,
        processing_status: 'idle', correction_fields: [], updated_at: this.time(), documents: [], contact_verification_required: true };
      output = this.photo; status = 201;
    } else {
      if (!existing || req.path.split('/')[5] !== existing.submission_id) return this.identityFailure('not_found',404);
      if (req.method === 'GET') output = existing;
      else if (req.method === 'DELETE') {
        if (existing.status !== 'draft') return this.identityFailure('kyc_state_invalid');
        this.photo = null; output = { status: 'ok' };
      } else {
        if (b.expected_edit_version !== existing.edit_version) return this.identityFailure('revision_conflict');
        if (req.path.endsWith('/revisions')) {
          if (req.auth !== 'account' || !['approved','correction_requested'].includes(existing.status) || b.base_revision !== existing.revision) return this.identityFailure('kyc_state_invalid');
          existing.revision++; existing.edit_version++; existing.status = 'draft'; existing.processing_status = 'idle'; existing.match_result = null;
          existing.documents = existing.documents.map(d => ({ ...d, revision: existing.revision })); output = existing; status = 201;
        } else {
          if (existing.status !== 'draft' || b.revision !== existing.revision) return this.identityFailure('kyc_state_invalid');
          if (req.method === 'PUT') {
            const next = b.fields as PhotoMatchFields;
            if (validateIdentity(next).length) return this.identityFailure('invalid_request',400);
            if (existing.correction_fields.length && Object.keys(next).some(k => next[k as keyof PhotoMatchFields] !== existing.fields[k as keyof PhotoMatchFields] && !existing.correction_fields.includes(k as keyof PhotoMatchFields))) return this.identityFailure('revision_conflict');
            existing.fields = next; existing.edit_version++; output = existing;
          } else if (req.path.endsWith('/submit')) {
            if (!(existing.fields.document_type === 'passport' ? ['front'] : ['front','back']).every(side => existing.documents.some(d => d.side === side))) return this.identityFailure('document_invalid',422);
            existing.status = 'submitted'; existing.processing_status = 'queued'; output = existing; status = 202;
          } else if (req.path.includes('/documents?')) {
            const d = b as PhotoDescriptor; if (!req.photo || photoHash(req.photo) !== d.original_sha256 || inspectPhoto(req.photo).contentType !== d.content_type ||
              existing.correction_fields.length && !existing.correction_fields.includes(d.side)) return this.identityFailure('document_invalid',422);
            existing.edit_version++; const document = { document_id: this.uuid(), revision: d.revision, side: d.side,
              original_sha256: d.original_sha256, stored_sha256: d.original_sha256, received_at: this.time() };
            existing.documents = [...existing.documents.filter(p => p.side !== d.side),document];
            output = { document_id: document.document_id, submission_id: existing.submission_id, revision: d.revision,
              side: d.side, original_sha256: d.original_sha256, stored_sha256: d.original_sha256, edit_version: existing.edit_version } satisfies PhotoUploadResult; status = 201;
          } else return this.identityFailure('not_found',404);
        }
      }
    }
    if (this.photo) this.photo.updated_at = this.time(); this.summary();
    const result = { status, authenticated: true as const, body: JSON.parse(JSON.stringify(output)) };
    if (req.method !== 'GET') { this.outcomes.set(cacheKey,{ fingerprint,result }); this.effects.push(req.method + req.path.split('?')[0]); }
    if (this.loseNext && req.method !== 'GET') { this.loseNext = false; throw new Error('identity_outcome_unknown'); }
    return result;
  }
}
