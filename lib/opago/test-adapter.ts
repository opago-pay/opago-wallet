import { bech32 } from 'bech32';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { signWalletAuthChallenge, type WalletAuthIntent } from '../wallet-auth-proof';
import { OpagoApi, type HkaTransport, type Request } from './api';
import { OpagoAccount, type AccountLogin, type WalletIdentity } from './account';
import type { Account, Wallet, WalletSession, PhotoMatchSummary, Address } from './contract-types';
import type { PrivateStore } from './store';
import { encodeBase64url } from './peer-native';
import { contractTestInvoice } from './test-invoice';
import type { UmaDisclosureProvider, UmaPeerTransport } from './uma';

const fixtureKey = new Uint8Array(32).fill(7);
const fixturePubkey = bytesToHex(schnorr.getPublicKey(fixtureKey));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
type TestState = { wallet: Wallet; account: Account; deletion: boolean; deleted: boolean };
type TestResult = { status: number; body: unknown; authenticated: true };
/** Explicit local contract adapter. No backend, provider, OIDC realm or real payment is contacted. */
export class F3ContractTestBackend implements HkaTransport {
  readonly mode = 'contract-test' as const;
  readonly calls: Request[] = [];
  readonly cache = new Map<string, { fingerprint: string; result: TestResult }>();
  private challenges = new Map<string, { message: string; intent: WalletAuthIntent }>();
  private proofs = new Map<string, { action: string; walletId: string }>();
  private exchanges = new Map<string, { receiver: string; amount?: number; requestId?: string }>();
  state: TestState;
  readonly identity: WalletIdentity;
  readonly login: AccountLogin;
  readonly disclosure: UmaDisclosureProvider;
  readonly peer: UmaPeerTransport;
  peerCalls = 0;
  constructor(readonly store: PrivateStore, readonly uuid: () => string, readonly network: 'mainnet' | 'regtest', readonly now: () => number = Date.now) {
    const walletId = uuid(), partyId = uuid();
    this.state = { deletion: false, deleted: false, wallet: { wallet_id: walletId, wallet_pubkey: '02' + fixturePubkey,
      network, custodial: false, status: 'unbound', party_id: null, address: null, photo_match: null },
      account: { party_id: partyId, account_generation: 1, email_verified: true, wallets: [], wallet_photo_match_status: 'none',
        identification_status: 'unidentified', identification_source: null } };
    this.identity = { publicKey: this.state.wallet.wallet_pubkey, network,
      sign: (challenge, intent, installationId) => signWalletAuthChallenge({
        getIdentityPublicKey: async () => hexToBytes(this.state.wallet.wallet_pubkey),
        signSchnorrWithIdentityKey: async digest => schnorr.sign(digest, fixtureKey, new Uint8Array(32)),
      }, challenge, intent, network, installationId, now()) };
    this.login = { mode: 'contract-test', login: async () => this.credential(), refresh: async () => this.credential(), logout: async () => {} };
    this.disclosure = { mode: 'contract-test', review: async (receiver, amountMsat, maxFeeSats) => ({ id: uuid(), receiver, amountMsat, maxFeeSats,
      expiresAt: now() + 600_000, kycStatus: 'NOT_VERIFIED', version: '0.2.0-test-disclosure-1', providers: [
        { name: 'OPAGO (Testadapter)', domain: 'api.opago.com', fields: ['Wallet-Zuordnung', 'Betrag', 'Empfänger', 'Fotoabgleich-Status'] },
        { name: 'Empfängeranbieter (Testadapter)', domain: receiver.split('@')[1], fields: ['given_name', 'family_name', 'date_of_birth', 'nationality', 'document_number', 'document_expiry', 'contact_email', 'UMA NOT_VERIFIED'] },
      ] }), assertCurrent: async d => { if (d.expiresAt <= now() || d.kycStatus !== 'NOT_VERIFIED') throw new Error('Test consent expired.'); } };
    this.peer = { send: async request => {
      this.peerCalls++;
      return { url: request.url, http_status: 200, content_type: 'application/json',
        body_base64url: encodeBase64url(utf8ToBytes(JSON.stringify({ synthetic_contract_test: true, method: request.method }))) };
    } };
  }
  async persist() { await this.store.write('f3.test.backend', { state: this.state, cache: [...this.cache], challenges: [...this.challenges], proofs: [...this.proofs], exchanges: [...this.exchanges] }); }
  async load() {
    const saved = await this.store.read<{ state: TestState; cache: [string, { fingerprint: string; result: TestResult }][];
      challenges: [string, { message: string; intent: WalletAuthIntent }][]; proofs: [string, { action: string; walletId: string }][];
      exchanges: [string, { receiver: string; amount?: number; requestId?: string }][] }>('f3.test.backend');
    if (!saved) return;
    this.state = saved.state;
    for (const [key,value] of saved.cache) this.cache.set(key, value);
    this.challenges = new Map(saved.challenges); this.proofs = new Map(saved.proofs); this.exchanges = new Map(saved.exchanges);
  }
  credential() { return { accessToken: 'test-account-token', expiresAt: this.now() + 900_000, authTime: this.now(), subject: 'synthetic-test-account' }; }
  time(delta = 0) { return new Date(Math.floor((this.now() + delta) / 1000) * 1000).toISOString().replace('.000Z', 'Z'); }
  session(): WalletSession { return { kind: 'session', wallet_id: this.state.wallet.wallet_id, scope: this.state.wallet.party_id ? 'wallet' : 'onboarding',
    access_token: 'test-wallet-access-' + this.uuid(), access_expires_at: this.time(900_000), refresh_token: 'test-wallet-refresh-' + this.uuid(), refresh_expires_at: this.time(30 * 86400_000) }; }
  async setKya(status: PhotoMatchSummary['status']) {
    const previous = this.state.wallet.photo_match;
    const revision = previous?.status === 'approved' && status !== 'approved' ? previous.revision + 1 : previous?.revision || 1;
    this.state.wallet.photo_match = { submission_id: previous?.submission_id || this.uuid(), revision, status,
      active_approval_revision: status === 'approved' ? revision : previous?.active_approval_revision || null, assurance: 'photo_data_match_only',
      match_result: status === 'approved' ? 'passed' : status === 'rejected' ? 'mismatch' : null,
      processing_status: status === 'in_review' ? 'processing' : status === 'approved' ? 'completed' : 'idle', correction_fields: [], updated_at: this.time() };
    this.state.account.wallet_photo_match_status = status === 'approved' ? 'passed' : 'pending';
    await this.persist();
  }
  address(name: string, status: Address['status']): Address {
    const lnurl = bech32.encode('lnurl', bech32.toWords(utf8ToBytes('https://opago.com/.well-known/lnurlp/' + name)), 4096).toUpperCase();
    return { address_id: this.state.wallet.address?.address_id || this.uuid(), name, address: name + '@opago.com', status,
      bound_at: this.time(), next_rename_allowed_at: null, lnurl, qr_payload: 'lightning:' + lnurl };
  }
  private failure(code: string, status = 409, retryable = false) {
    return { status, authenticated: true as const, body: { error: { code, message: 'Synthetic contract error.', retryable, details: {} }, request_id: this.uuid() } };
  }
  async request(req: Request) {
    this.calls.push(clone(req));
    const body = req.body as Record<string, unknown>;
    const cacheKey = req.method + req.path + req.idempotencyKey;
    const fingerprint = JSON.stringify({ body: req.body, auth: req.auth });
    const cached = this.cache.get(cacheKey);
    if (cached) return cached.fingerprint === fingerprint ? clone(cached.result) : this.failure('idempotency_conflict');
    if (req.auth === 'account' && req.bearer !== 'test-account-token') return this.failure('session_expired', 401);
    if (req.auth === 'wallet' && !req.bearer?.startsWith('test-wallet-access-')) return this.failure('session_expired', 401);
    if (this.state.deletion && req.auth !== 'receipt' && !req.path.endsWith('/onboarding/restart') && !req.path.includes('/auth/')) return this.failure('account_deleted', 410);
    let output: unknown; let status = 200;
    const wallet = this.state.wallet;
    if (req.path === '/api/v2/wallet/auth/challenge') {
      const intent = { action: body.action, action_params: body.action_params } as WalletAuthIntent;
      if (body.wallet_pubkey !== wallet.wallet_pubkey || body.network !== this.network) return this.failure('account_mismatch', 403);
      if (intent.action === 'login' && wallet.status === 'closed') return this.failure('wallet_closed', 410);
      if (intent.action === 'login' && wallet.party_id && req.auth !== 'account') return this.failure('reproof_required', 401);
      if ((intent.action === 'wallet_bind' || intent.action === 'wallet_restore') && req.auth !== 'account') return this.failure('reproof_required', 401);
      const params = '{' + Object.entries(intent.action_params).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ':' + JSON.stringify(v)).join(',') + '}';
      const id = this.uuid();
      const message = ['opago-wallet-auth', 'domain: api.opago.com', 'network: ' + this.network, 'wallet_pubkey: ' + wallet.wallet_pubkey,
        'nonce: ' + bytesToHex(sha256(utf8ToBytes(id))), 'issued_at: ' + this.time(), 'expires_at: ' + this.time(300_000),
        'action: ' + intent.action, 'action_params_sha256: ' + bytesToHex(sha256(utf8ToBytes(params)))].join('\n');
      this.challenges.set(id, { message, intent }); output = { challenge_id: id, message, expires_at: this.time(300_000) };
    } else if (req.path.endsWith('/auth/verify')) {
      const c = this.challenges.get(String(body.challenge_id));
      if (!c || !schnorr.verify(String(body.signature), sha256(utf8ToBytes(c.message)), fixturePubkey)) return this.failure('signature_invalid', 401);
      this.challenges.delete(String(body.challenge_id));
      if (c.intent.action === 'login') output = this.session();
      else { const token = 'test-proof-' + this.uuid(); this.proofs.set(token, { action: c.intent.action, walletId: wallet.wallet_id });
        output = { kind: 'proof', proof_token: token, action: c.intent.action, wallet_id: wallet.wallet_id, expires_at: this.time(300_000) }; }
    } else if (req.path.endsWith('/auth/refresh')) output = this.session();
    else if (req.path.endsWith('/auth/logout')) output = { status: 'ok' };
    else if (req.path === '/api/v2/account' && req.method === 'GET') output = this.state.account;
    else if (req.path === '/api/v2/account' && req.method === 'DELETE') {
      this.state.deletion = true; this.state.account.account_generation++; wallet.status = 'deleted';
      if (wallet.address) wallet.address.status = 'deactivated';
      status = 202; output = { deletion_id: this.uuid(), status: 'deletion_pending', requested_at: this.time(), receipt_token: 'test-receipt-' + this.uuid(), receipt_expires_at: this.time(7 * 86400_000) };
    } else if (req.path.includes('/account/deletions/')) {
      output = { deletion_id: req.path.split('/').at(-1), status: this.state.deleted ? 'deleted' : 'deletion_pending', access_revoked_at: this.time(), identity_account_deleted_at: this.state.deleted ? this.time() : null, retained_data: true };
    } else if (req.path === '/api/v2/wallet/me') output = wallet;
    else if (req.path === '/api/v2/account/wallets') {
      if (body.party_id !== this.state.account.party_id || body.account_generation !== this.state.account.account_generation ||
          this.proofs.get(String(body.proof_token))?.action !== 'wallet_bind') return this.failure('account_mismatch', 403);
      wallet.party_id = this.state.account.party_id; wallet.status = 'active';
      this.state.account.wallets = [{ wallet_id: wallet.wallet_id, network: wallet.network, wallet_pubkey: wallet.wallet_pubkey, custodial: false, status: 'active' }];
      output = wallet; status = 201;
    } else if (req.path === '/api/v2/wallet/restore') {
      if (body.wallet_id !== wallet.wallet_id || this.proofs.get(String(body.proof_token))?.action !== 'wallet_restore') return this.failure('account_mismatch', 403);
      wallet.status = 'active'; if (wallet.address) wallet.address.status = 'deactivated'; output = this.session();
    } else if (req.path === '/api/v2/wallet/close') {
      wallet.status = 'closed'; if (wallet.address) wallet.address.status = 'deactivated'; output = wallet;
    } else if (req.path === '/api/v2/wallet/onboarding/restart') {
      if (!this.state.deleted || this.proofs.get(String(body.proof_token))?.action !== 'onboarding_restart') return this.failure('account_deleted', 410);
      wallet.party_id = null; wallet.status = 'unbound'; wallet.address = null; wallet.photo_match = null;
      this.state.account.party_id = this.uuid(); this.state.account.wallets = []; this.state.account.wallet_photo_match_status = 'none';
      this.state.deletion = false; this.state.deleted = false; output = this.session();
    } else if (req.path.startsWith('/api/v2/wallet/address')) {
      if (wallet.status !== 'active' || !wallet.photo_match?.active_approval_revision) return this.failure('kyc_required', 403);
      if (req.method === 'PUT') { wallet.address = this.address(String(body.name), 'active'); output = wallet.address; }
      else if (wallet.address) { wallet.address.status = req.path.endsWith('/deactivate') ? 'deactivated' : 'active'; output = wallet.address; }
      else return this.failure('address_not_found', 404);
    } else if (req.path.includes('/travel-rule/uma-')) {
      if (wallet.status !== 'active' || wallet.address?.status !== 'active' || !wallet.photo_match?.active_approval_revision) return this.failure('address_pending_kyc', 403);
      if (req.path.endsWith('/uma-discovery')) {
        const id = this.uuid(); const receiver = String(body.receiver_address); this.exchanges.set(id, { receiver });
        output = { exchange_id: id, expires_at: this.time(600_000), request: { method: 'GET', url: 'https://' + receiver.split('@')[1] + '/.well-known/lnurlp/' + receiver.split('@')[0] + '?umaVersion=1.0' } };
      } else {
        const id = String(body.exchange_id); const exchange = this.exchanges.get(id);
        if (!exchange) return this.failure('not_found', 404);
        const callback = 'https://' + exchange.receiver.split('@')[1] + '/uma/callback';
        if (req.path.endsWith('/verify')) output = { exchange_id: id, status: 'uma_supported', callback, min_sendable_msat: 1000,
          max_sendable_msat: 1_000_000_000, metadata: JSON.stringify([['text/plain', 'Synthetic UMA payment'], ['text/identifier', exchange.receiver]]), expires_at: this.time(600_000) };
        else if (req.path.endsWith('/uma-pay-request')) {
          if (exchange.amount && exchange.amount !== body.amount_msat) return this.failure('amount_mismatch');
          exchange.amount = Number(body.amount_msat); exchange.requestId ||= this.uuid();
          output = { exchange_id: id, request_id: exchange.requestId, expires_at: this.time(600_000), request: {
            method: 'POST', url: callback, content_type: 'application/json', body_base64url: encodeBase64url(utf8ToBytes(JSON.stringify({ synthetic_contract_test: true, kycStatus: 'NOT_VERIFIED' }))),
          } };
        } else {
          if (!exchange.amount || body.request_id !== exchange.requestId) return this.failure('operation_conflict');
          const hash = bytesToHex(sha256(utf8ToBytes(id))); const description = bytesToHex(sha256(utf8ToBytes('Synthetic effective UMA invoice metadata ' + id)));
          output = { exchange_id: id, travel_rule_exchange: 'complete', bolt11: contractTestInvoice(exchange.amount / 1000, this.network, hash, description, this.now()),
            payment_hash: hash, amount_msat: exchange.amount, network: this.network, invoice_description_hash: description, expires_at: this.time(3600_000), failure_code: null };
        }
      }
    } else return this.failure('not_found', 404);
    const result = { status, body: clone(output), authenticated: true as const };
    if (req.idempotencyKey) this.cache.set(cacheKey, { fingerprint, result });
    await this.persist();
    return clone(result);
  }
  createAccount() { return new OpagoAccount(new OpagoApi(this), this.store, this.identity, this.login, this.uuid, this.now); }
}
