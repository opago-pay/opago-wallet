import type { AccountCredential } from './account';
import { parseStrictJson } from './encoding';
import { pairingQr, pairingIntent, payoutBinding, type PairingQr, type PairingIntent, type PayoutBinding, isPairingId } from './payout-pairing-model';

export type PayoutPairingPorts = {
  login(): Promise<AccountCredential>;
  status(credential: AccountCredential): Promise<unknown>;
  intent(credential: AccountCredential, id: string): Promise<unknown>;
  /** The backend adapter must bind its wallet_bind proof to this complete context.
   * This port is supplied by the owned Challenge/Verify integration, never a local token. */
  prove(context: { credential: AccountCredential; qr: PairingQr; intent: PairingIntent; publicKey: string; network: 'mainnet' | 'regtest' }): Promise<string>;
  confirm(credential: AccountCredential, qr: PairingQr, proof: string, version: number): Promise<unknown>;
  unlink(credential: AccountCredential, version: number, operationId: string): Promise<unknown>;
  uuid(): string;
  current(): void;
};
export class PayoutPairingFlow {
  qr: PairingQr | null = null;
  credential: AccountCredential | null = null;
  binding: PayoutBinding | null = null;
  intent: PairingIntent | null = null;
  stage: 'idle' | 'scanned' | 'review' | 'unlink_review' | 'busy' | 'linked' | 'unlinked' | 'unknown' | 'cancelled' = 'idle';
  private generation = 0;
  private flight = false;
  private uncertainSubject: string | null = null;
  constructor(private readonly ports: PayoutPairingPorts, readonly publicKey: string | null, readonly network: 'mainnet' | 'regtest', private readonly now = Date.now) {
    if ((publicKey !== null && !/^0[23][0-9a-f]{64}$/.test(publicKey)) || !['mainnet','regtest'].includes(network)) throw new Error('invalid_wallet_identity');
  }
  cancel() {
    this.generation++; this.qr = null; this.credential = null; this.intent = null; this.binding = null;
    // Dismissing sensitive UI cannot undo a dispatched mutation. Keep only the
    // account identity needed for read-only reconciliation, not its credential.
    this.stage = this.uncertainSubject ? 'unknown' : 'cancelled';
  }
  scan(raw: string) {
    if (this.flight || this.stage === 'unknown' || raw.length > 4096) throw new Error('pairing_busy');
    this.cancel(); this.qr = pairingQr(parseStrictJson(raw), this.now()); this.stage = 'scanned';
  }
  private guard() { const generation = this.generation; this.ports.current(); return () => { this.ports.current(); if (generation !== this.generation) throw new Error('pairing_cancelled'); }; }
  private async exclusive(run: (check: () => void) => Promise<void>) {
    if (this.flight) throw new Error('pairing_busy'); this.flight = true;
    try { await run(this.guard()); } finally { this.flight = false; }
  }
  async prepare() {
    await this.exclusive(async check => {
      if (this.stage === 'unknown') throw new Error('pairing_outcome_unknown');
      if (!this.publicKey) throw new Error('wallet_unavailable');
      if (!this.qr) throw new Error('invalid_pairing_code');
      const qr = pairingQr(this.qr, this.now());
      this.credential = null; this.binding = null; this.intent = null; this.stage = 'scanned';
      const credential = await this.ports.login(); check();
      this.fresh(credential);
      const intent = pairingIntent(await this.ports.intent(credential, qr.intent_id)); check();
      if (intent.account_subject !== credential.subject) throw new Error('account_mismatch');
      if (intent.intent_id !== qr.intent_id || intent.expires_at !== qr.expires_at || intent.status !== 'pending') throw new Error('pairing_expired');
      const binding = payoutBinding(await this.ports.status(credential), credential.subject); check();
      pairingQr(qr, this.now());
      if (binding.binding_version !== intent.binding_version) throw new Error('revision_conflict');
      if (binding.wallet && !intent.replace) throw new Error('wallet_already_linked');
      this.credential = credential; this.intent = intent; this.binding = binding; this.stage = 'review';
    });
  }
  async confirm() {
    await this.exclusive(async check => {
      if (this.stage !== 'review' || !this.publicKey || !this.qr || !this.credential || !this.intent || !this.binding) throw new Error('pairing_not_reviewed');
      const qr = pairingQr(this.qr, this.now()), credential = this.credential, intent = this.intent;
      this.fresh(credential);
      this.stage = 'busy';
      try {
        const proof = await this.ports.prove({ credential, qr, intent, publicKey: this.publicKey, network: this.network }); check();
        pairingQr(qr, this.now());
        if (typeof proof !== 'string' || !/^[A-Za-z0-9_-]{32,512}$/.test(proof)) throw new Error('invalid_pairing_proof');
        // An unknown answer must be reconciled; never dispatch another proof automatically.
        this.uncertainSubject = credential.subject;
        this.stage = 'unknown';
        const binding = payoutBinding(await this.ports.confirm(credential, qr, proof, intent.binding_version), credential.subject); check();
        if (binding.binding_version !== intent.binding_version + 1 || !binding.wallet || binding.wallet.identity_pubkey.replace(/^0[23](?=[0-9a-f]{64}$)/,'') !== this.publicKey.replace(/^0[23](?=[0-9a-f]{64}$)/,'') || binding.wallet.network !== this.network) throw new Error('invalid_pairing_response');
        this.uncertainSubject = null;
        this.binding = binding; this.qr = null; this.stage = 'linked';
      } catch (error) { check(); if (this.stage !== 'unknown') this.stage = 'review'; throw error; }
    });
  }
  /** Review an authoritative snapshot before unlinking. No Spark key is required. */
  async prepareUnlink() {
    await this.exclusive(async check => {
      if (this.stage === 'unknown') throw new Error('pairing_outcome_unknown');
      this.credential = null; this.binding = null; this.qr = null; this.intent = null; this.stage = 'idle';
      const credential = await this.ports.login(); check();
      this.fresh(credential);
      const binding = payoutBinding(await this.ports.status(credential), credential.subject); check();
      if (!binding.wallet) throw new Error('wallet_not_linked');
      this.credential = credential; this.binding = binding; this.qr = null; this.intent = null;
      this.stage = 'unlink_review';
    });
  }
  /** Explicit confirmation uses the reviewed revision. Losing the old seed cannot
   * block unlink. The backend atomically disables OPAGO payments and retains evidence. */
  async unlink() {
    await this.exclusive(async check => {
      if (this.stage !== 'unlink_review' || !this.credential || !this.binding?.wallet) throw new Error('unlink_not_reviewed');
      const credential = this.credential, before = this.binding;
      this.fresh(credential);
      this.uncertainSubject = credential.subject;
      this.stage = 'unknown';
      const binding = payoutBinding(await this.ports.unlink(credential, before.binding_version, this.ports.uuid()), credential.subject); check();
      if (binding.wallet || binding.binding_version !== before.binding_version + 1) throw new Error('invalid_pairing_response');
      this.uncertainSubject = null;
      this.binding = binding; this.qr = null; this.intent = null; this.stage = 'unlinked';
    });
  }
  /** Read-only recovery after a lost mutation response. Never repeats a mutation.
   * A fresh review is still required before any subsequent operation. */
  async reconcile() {
    await this.exclusive(async check => {
      if (this.stage !== 'unknown' || !this.uncertainSubject) throw new Error('pairing_not_uncertain');
      const subject = this.uncertainSubject;
      const credential = await this.ports.login(); check(); this.fresh(credential);
      if (credential.subject !== subject) throw new Error('account_mismatch');
      const binding = payoutBinding(await this.ports.status(credential), subject); check();
      this.uncertainSubject = null;
      this.binding = binding; this.credential = credential;
      this.qr = null; this.intent = null; this.stage = 'idle';
    });
  }
  /** Display prerequisite only; the API must enforce these gates for every payer. */
  get paymentsAvailable() {
    try { this.ports.current(); } catch { return false; }
    return this.stage === 'linked' && !!this.credential && this.credential.expiresAt > this.now() &&
      !!this.binding?.wallet && this.binding.incoming_enabled && this.binding.outgoing_enabled;
  }
  private fresh(credential: AccountCredential) {
    if (!isPairingId(credential.subject) || typeof credential.accessToken !== 'string' || !credential.accessToken ||
        !Number.isFinite(credential.expiresAt) || !Number.isFinite(credential.authTime) ||
        credential.expiresAt <= this.now() || credential.authTime > this.now() || this.now() - credential.authTime > 300_000) throw new Error('reproof_required');
  }
}
