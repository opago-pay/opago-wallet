import { OpagoApi, OpagoError, type AuthKind } from './api';
import type { Account, Wallet, WalletSession, ActionProof, Address, DeletionReceipt, DeletionStatus, Challenge } from './contract-types';
import type { PrivateStore } from './store';
import type { WalletAuthIntent, WalletAuthVerifyRequest } from '../wallet-auth-proof';

export type AccountCredential = { accessToken: string; expiresAt: number; authTime: number; subject: string };
/** OIDC adapter returns cryptographically verified claims, never decoded-only JWTs. */
export interface AccountLogin {
  readonly mode: 'oidc' | 'contract-test';
  login(fresh: boolean): Promise<AccountCredential>;
  refresh(): Promise<AccountCredential>;
  logout(): Promise<void>;
}
export interface WalletIdentity {
  /** Account-only access during a disconnected Spark session has no signing identity. */
  available?: boolean;
  publicKey: string;
  network: 'mainnet' | 'regtest';
  sign(challenge: Challenge, intent: WalletAuthIntent, installationId: string): Promise<WalletAuthVerifyRequest>;
}
export type AccountState = { credential: AccountCredential | null; account: Account | null; session: WalletSession | null;
  wallet: Wallet | null; deletion: DeletionReceipt | null; deletionStatus: DeletionStatus | null; syncGeneration?: number; syncPaused?: boolean };
type Operation = { key: string; method: 'GET' | 'POST' | 'PUT' | 'DELETE'; path: string; body: unknown; auth: AuthKind;
  principal: string; result?: unknown; retryAt?: number; terminalError?: string };
export const photoMatchReady = (wallet: Wallet | null): boolean => !!wallet && wallet.status === 'active' &&
  wallet.photo_match?.assurance === 'photo_data_match_only' && !!wallet.photo_match.active_approval_revision &&
  wallet.photo_match.active_approval_revision <= wallet.photo_match.revision;

/** KYA owns intake/photo capture. F3 consumes only the authoritative Wallet.photo_match interface. */
export class OpagoAccount {
  state: AccountState = { credential: null, account: null, session: null, wallet: null, deletion: null, deletionStatus: null };
  installationId = '';
  verifiedAt = 0;
  hasPendingAddressOperation = false;
  get walletAvailable() { return this.identity.available !== false && !!this.identity.publicKey; }
  private queue: Promise<unknown> = Promise.resolve();
  private readonly prefix: string;
  constructor(readonly api: OpagoApi, readonly store: PrivateStore, readonly identity: WalletIdentity,
    readonly login: AccountLogin, readonly uuid: () => string, readonly now: () => number = Date.now,
    readonly wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
    this.prefix = 'f3.' + api.transport.mode + '.' + identity.network + '.' + identity.publicKey;
    if (api.transport.mode === 'contract-test' !== (login.mode === 'contract-test')) throw new Error('Test and live adapters cannot be mixed.');
  }
  exclusive<T>(run: () => Promise<T>): Promise<T> {
    const work = this.queue.catch(() => undefined).then(run); this.queue = work; return work;
  }
  async load() {
    this.installationId = await this.store.read<string>(this.prefix + '.installation') || this.uuid();
    await this.store.write(this.prefix + '.installation', this.installationId);
    this.state = await this.store.read<AccountState>(this.prefix + '.state') || this.state;
    this.hasPendingAddressOperation = !!await this.store.read(this.operationKey('address.challenge'));
    // An address is never made receivable from a cached snapshot after restart.
    this.state.wallet = null;
  }
  async save() { await this.store.write(this.prefix + '.state', this.state); }
  /** Fence delayed F5 work before account lifecycle side effects. Old outboxes stay
   * isolated and cannot be resumed by a new account/ownership lifecycle. */
  private async invalidateSync() { this.state.syncGeneration = (this.state.syncGeneration || 0) + 1; this.state.syncPaused = true; await this.save(); }
  /** A failed status refresh must still leave sign-in and ownership recovery accessible. */
  async refreshAfterLoad(): Promise<unknown> {
    let failure: unknown;
    if (!this.state.deletion && this.state.credential) {
      try { await this.refreshAccount(); } catch (cause) { this.state.account = null; failure = cause; }
    }
    if (!this.state.deletion && this.state.session) {
      try { await this.refresh(); } catch (cause) { this.state.wallet = null; this.verifiedAt = 0; failure ||= cause; }
    }
    return failure;
  }
  operationKey(slot: string) { return this.prefix + '.operation.' + slot; }
  private principal(auth: AuthKind): string {
    return auth === 'account' ? this.state.credential?.subject || '' : auth === 'receipt' ? this.state.deletion?.deletion_id || '' : this.identity.publicKey;
  }
  async bearer(auth: AuthKind): Promise<string | undefined> {
    if (auth === 'none') return undefined;
    if (auth === 'receipt') {
      if (!this.state.deletion || Date.parse(this.state.deletion.receipt_expires_at) <= this.now()) throw new OpagoError('receipt_expired');
      return this.state.deletion.receipt_token;
    }
    if (this.state.deletion) throw new OpagoError('account_deleted');
    if (auth === 'account') {
      if (!this.state.credential) throw new OpagoError('session_expired');
      if (this.state.credential.expiresAt <= this.now()) {
        const previous = this.state.credential;
        const next = await this.login.refresh();
        if (next.subject !== previous.subject || next.expiresAt <= this.now()) throw new OpagoError('account_mismatch');
        this.state.credential = next; await this.save();
      }
      return this.state.credential.accessToken;
    }
    if (!this.state.session) throw new OpagoError('session_expired');
    if (Date.parse(this.state.session.access_expires_at) <= this.now()) await this.refreshWallet();
    return this.state.session!.access_token;
  }
  async mutate<T>(slot: string, method: Operation['method'], path: string, body: unknown, auth: AuthKind): Promise<T> {
    const key = this.operationKey(slot);
    const principal = this.principal(auth);
    let operation = await this.store.read<Operation>(key);
    if (operation && (operation.path !== path || operation.method !== method || operation.auth !== auth ||
        operation.principal !== principal || JSON.stringify(operation.body) !== JSON.stringify(body))) throw new OpagoError('operation_conflict');
    if (operation && Object.hasOwn(operation, 'result')) return operation.result as T;
    if (operation?.retryAt && operation.retryAt > this.now()) throw new OpagoError('retry_later', true, 429, Math.ceil((operation.retryAt - this.now()) / 1000));
    operation ||= { key: this.uuid(), method, path, body, auth, principal };
    await this.store.write(key, operation); // Before any backend side effect.
    let refreshed = false;
    let attempt = 0;
    for (;;) {
      const bearer = await this.bearer(auth);
      try {
        const result = await this.api.call<T>({ method, path, body, auth, bearer, idempotencyKey: operation.key });
        operation.result = result; await this.store.write(key, operation);
        return result;
      } catch (cause) {
        if (cause instanceof OpagoError && cause.code === 'session_expired' && auth === 'wallet' && !refreshed) {
          refreshed = true; await this.refreshWallet(); continue;
        }
        if (cause instanceof OpagoError && cause.code === 'session_expired' && auth === 'account' && !refreshed) {
          refreshed = true;
          const next = await this.login.refresh();
          if (next.subject !== this.state.credential?.subject) throw new OpagoError('account_mismatch');
          this.state.credential = next; await this.save(); continue;
        }
        if (cause instanceof OpagoError && cause.retryable && attempt < 4 &&
            ['upstream_pending', 'upstream_unavailable', 'upstream_timeout', 'hpke_unavailable', 'internal_error', 'tme_pending', 'tme_unavailable', 'hpke_replay', 'rate_limited'].includes(cause.code)) {
          const delay = Math.max(cause.retryAfterSeconds * 1000, 1000 * 2 ** attempt * (1 + Math.random() * 0.2));
          operation.retryAt = this.now() + delay; await this.store.write(key, operation); attempt++;
          await this.wait(delay); continue; // Same semantic input/key; HKA creates a fresh envelope.
        }
        if (cause instanceof OpagoError && !cause.retryable &&
            !['session_expired', 'refresh_invalid', 'reproof_required'].includes(cause.code)) {
          operation.terminalError = cause.code; await this.store.write(key, operation);
        }
        throw cause; // Retain intent, including unknown outcome, for explicit user-visible retry.
      }
    }
  }
  async finish(...slots: string[]) { for (const s of slots) await this.store.remove(this.operationKey(s)); }
  /** Only a contract-confirmed terminal rejection permits abandoning an action proof flow.
   * Unknown outcomes and payment intents cannot be discarded through this method. */
  async discardRejectedAction(flow: 'login' | 'bind' | 'address' | 'restore' | 'close' | 'restart') {
    const slots = [flow + '.challenge', flow + '.verify', flow + '.commit'];
    const operations = await Promise.all(slots.map(s => this.store.read<Operation>(this.operationKey(s))));
    if (!operations.some(o => o?.terminalError)) throw new OpagoError('operation_conflict');
    await this.finish(...slots);
  }
  async read<T>(path: string, auth: AuthKind): Promise<T> {
    return this.api.call<T>({ method: 'GET', path, body: {}, auth, bearer: await this.bearer(auth) });
  }
  async signIn(fresh = false, resumeSync = true) {
    const credential = await this.login.login(fresh);
    if (credential.expiresAt <= this.now() || (fresh && this.now() - credential.authTime > 300_000)) throw new OpagoError('reproof_required');
    if (this.state.credential && this.state.credential.subject !== credential.subject && this.state.session) throw new OpagoError('account_mismatch');
    this.state.credential = credential;
    if (resumeSync) delete this.state.syncPaused; // Internal fresh auth during deletion must preserve its lifecycle suspension.
    await this.save(); // Browser login can lock the local wallet; resume account lookup after unlock.
    await this.refreshAccount();
  }
  async refreshAccount() { this.state.account = await this.read<Account>('/api/v2/account', 'account'); await this.save(); }
  private async freshAccount() {
    const subject = this.state.credential?.subject;
    if (!subject || this.now() - this.state.credential!.authTime > 300_000) await this.signIn(true, false);
    if (subject && subject !== this.state.credential?.subject) throw new OpagoError('account_mismatch');
    await this.bearer('account');
  }
  async proof(intent: WalletAuthIntent, auth: AuthKind, flow: string, renewed = false): Promise<WalletSession | ActionProof> {
    if (!this.walletAvailable) throw new OpagoError('wallet_unavailable');
    const challenge = await this.mutate<Challenge>(flow + '.challenge', 'POST', '/api/v2/wallet/auth/challenge', {
      wallet_pubkey: this.identity.publicKey, network: this.identity.network, installation_id: this.installationId, ...intent,
    }, auth);
    const verifyKey = this.operationKey(flow + '.verify');
    const saved = await this.store.read<Operation>(verifyKey);
    if (!saved && Date.parse(challenge.expires_at) <= this.now()) {
      // No verify request was persisted/dispatched: renewing this challenge cannot repeat a mutation.
      await this.finish(flow + '.challenge');
      if (renewed) throw new OpagoError('challenge_expired');
      return this.proof(intent, auth, flow, true);
    }
    // Never sign twice to construct different bytes for the same logical verification.
    const payload = saved?.body || await this.identity.sign(challenge, intent, this.installationId);
    const result = await this.mutate<WalletSession | ActionProof>(flow + '.verify', 'POST', '/api/v2/wallet/auth/verify', payload, auth);
    if (intent.action === 'login' ? result.kind !== 'session' : result.kind !== 'proof' || result.action !== intent.action) throw new OpagoError('action_mismatch');
    const requestedWallet = 'wallet_id' in intent.action_params ? intent.action_params.wallet_id : this.state.session?.wallet_id;
    if (result.kind === 'proof' && requestedWallet && result.wallet_id !== requestedWallet) throw new OpagoError('account_mismatch');
    return result;
  }
  async proveOwnership() {
    const session = await this.proof({ action: 'login', action_params: {} }, this.state.credential ? 'account' : 'none', 'login') as WalletSession;
    this.state.session = session; await this.save(); await this.refresh(); await this.finish('login.challenge', 'login.verify');
  }
  private async refreshWallet() {
    const session = this.state.session;
    if (!session || Date.parse(session.refresh_expires_at) <= this.now()) throw new OpagoError('refresh_invalid');
    const next = await this.mutate<WalletSession>('refresh', 'POST', '/api/v2/wallet/auth/refresh', { refresh_token: session.refresh_token, installation_id: this.installationId }, 'none');
    if (next.wallet_id !== session.wallet_id || next.scope !== session.scope || Date.parse(next.access_expires_at) <= this.now()) throw new OpagoError('account_mismatch');
    this.state.session = next; await this.save(); await this.finish('refresh');
  }
  checkWallet(wallet: Wallet) {
    if (wallet.wallet_pubkey !== this.identity.publicKey || wallet.network !== this.identity.network || wallet.custodial ||
        (this.state.session && wallet.wallet_id !== this.state.session.wallet_id) ||
        (wallet.party_id && this.state.account && wallet.party_id !== this.state.account.party_id)) throw new OpagoError('account_mismatch');
  }
  async refresh() {
    this.verifiedAt = 0;
    const wallet = await this.read<Wallet>('/api/v2/wallet/me', 'wallet'); this.checkWallet(wallet);
    this.state.wallet = wallet; this.verifiedAt = this.now(); await this.save();
  }
  async bind() {
    await this.freshAccount();
    const account = this.state.account!;
    if (!account.email_verified || !this.state.session) throw new OpagoError('reproof_required');
    const proof = await this.proof({ action: 'wallet_bind', action_params: { party_id: account.party_id, account_generation: account.account_generation } }, 'account', 'bind') as ActionProof;
    const wallet = await this.mutate<Wallet>('bind.commit', 'POST', '/api/v2/account/wallets', {
      wallet_pubkey: this.identity.publicKey, network: this.identity.network, installation_id: this.installationId,
      party_id: account.party_id, account_generation: account.account_generation, proof_token: proof.proof_token,
      submission_id: this.state.wallet?.photo_match?.submission_id || null,
    }, 'account');
    this.checkWallet(wallet);
    if (wallet.party_id !== account.party_id) throw new OpagoError('account_mismatch');
    this.state.wallet = wallet; await this.save();
    await this.finish('bind.challenge', 'bind.verify', 'bind.commit');
    // Bootstrap tokens do not acquire wallet rights by changing client state.
    await this.proveOwnership();
  }
  async restore() {
    await this.freshAccount();
    const account = this.state.account!;
    const wallet = account.wallets.find(w => w.wallet_pubkey === this.identity.publicKey && w.network === this.identity.network && w.status !== 'deleted');
    if (!wallet || wallet.custodial) throw new OpagoError('account_mismatch');
    const proof = await this.proof({ action: 'wallet_restore', action_params: { wallet_id: wallet.wallet_id,
      party_id: account.party_id, account_generation: account.account_generation } }, 'account', 'restore') as ActionProof;
    const session = await this.mutate<WalletSession>('restore.commit', 'POST', '/api/v2/wallet/restore', {
      wallet_id: wallet.wallet_id, proof_token: proof.proof_token, installation_id: this.installationId,
    }, 'account');
    if (session.wallet_id !== wallet.wallet_id || session.scope !== 'wallet') throw new OpagoError('account_mismatch');
    this.state.session = session; this.state.wallet = null; await this.save(); await this.refresh();
    if ((this.state.wallet as Wallet | null)?.address?.status === 'active') { this.state.wallet = null; await this.save(); throw new Error('Restore unexpectedly activated the address.'); }
    await this.finish('restore.challenge', 'restore.verify', 'restore.commit');
  }
  async address(action: 'set' | 'rename' | 'deactivate' | 'reactivate', name?: string) {
    await this.refresh();
    if (action !== 'deactivate' && !photoMatchReady(this.state.wallet)) throw new OpagoError('kyc_required');
    const current = this.state.wallet!.address;
    const intent: WalletAuthIntent = action === 'set' || action === 'rename' ? {
      action: action === 'set' ? 'address_bind' : 'address_rename', action_params: { name: name || '' },
    } : { action: action === 'deactivate' ? 'address_deactivate' : 'address_reactivate', action_params: { address_id: current?.address_id || '' } };
    const previous = await this.store.read<Operation>(this.operationKey('address.challenge'));
    if (previous && JSON.stringify(previous.body) !== JSON.stringify({ wallet_pubkey: this.identity.publicKey,
      network: this.identity.network, installation_id: this.installationId, ...intent })) {
      // A new explicit address choice can replace a confirmed rejection, never an unknown outcome.
      await this.discardRejectedAction('address');
    }
    this.hasPendingAddressOperation = true;
    const proof = await this.proof(intent, 'wallet', 'address') as ActionProof;
    const address = await this.mutate<Address>('address.commit', action === 'set' || action === 'rename' ? 'PUT' : 'POST',
      action === 'set' || action === 'rename' ? '/api/v2/wallet/address' : '/api/v2/wallet/address/' + action,
      { ...(name ? { name } : {}), proof_token: proof.proof_token }, 'wallet');
    if ((name && address.name !== name) || ((action === 'reactivate' || action === 'deactivate') && address.address_id !== current?.address_id)) throw new OpagoError('address_changed');
    this.state.wallet!.address = address; await this.save(); await this.finish('address.challenge', 'address.verify', 'address.commit');
    this.hasPendingAddressOperation = false;
  }
  async resumeAddress() {
    const previous = await this.store.read<Operation>(this.operationKey('address.challenge'));
    if (!previous) throw new OpagoError('operation_conflict');
    const intent = previous.body as WalletAuthIntent;
    const actions = { address_bind: 'set', address_rename: 'rename', address_deactivate: 'deactivate', address_reactivate: 'reactivate' } as const;
    if (!(intent.action in actions)) throw new OpagoError('action_mismatch');
    await this.address(actions[intent.action as keyof typeof actions], 'name' in intent.action_params ? intent.action_params.name : undefined);
  }
  async close() {
    await this.invalidateSync();
    await this.refresh();
    const proof = await this.proof({ action: 'wallet_close', action_params: { wallet_id: this.state.wallet!.wallet_id } }, 'wallet', 'close') as ActionProof;
    const wallet = await this.mutate<Wallet>('close.commit', 'POST', '/api/v2/wallet/close', { proof_token: proof.proof_token }, 'wallet');
    this.checkWallet(wallet);
    if (wallet.status !== 'closed' || wallet.address?.status === 'active') throw new Error('Invalid closed wallet.');
    this.state.wallet = wallet; this.state.session = null; await this.save(); await this.finish('close.challenge', 'close.verify', 'close.commit');
  }
  async deleteAccount() {
    await this.invalidateSync();
    await this.freshAccount();
    const receipt = await this.mutate<DeletionReceipt>('delete', 'DELETE', '/api/v2/account', {}, 'account');
    this.state.deletion = receipt; this.state.session = null; this.state.wallet = null; this.state.account = null;
    this.state.credential = null; await this.save(); await this.login.logout(); await this.finish('delete');
  }
  async deletionStatus() {
    const receipt = this.state.deletion;
    if (!receipt) throw new Error('No deletion receipt.');
    const status = await this.read<DeletionStatus>('/api/v2/account/deletions/' + receipt.deletion_id, 'receipt');
    if (status.deletion_id !== receipt.deletion_id) throw new Error('Invalid deletion receipt.');
    this.state.deletionStatus = status; await this.save();
  }
  async restartOnboarding() {
    await this.deletionStatus();
    if (this.state.deletionStatus?.status !== 'deleted') throw new OpagoError('account_deleted');
    const proof = await this.proof({ action: 'onboarding_restart', action_params: {} }, 'none', 'restart') as ActionProof;
    const session = await this.mutate<WalletSession>('restart.commit', 'POST', '/api/v2/wallet/onboarding/restart', { proof_token: proof.proof_token }, 'none');
    if (session.scope !== 'onboarding') throw new Error('Restart must be enrollment only.');
    this.state = { credential: null, account: null, wallet: null, session, deletion: null, deletionStatus: null, syncGeneration: (this.state.syncGeneration || 0) + 1 };
    await this.save(); await this.refresh(); await this.finish('restart.challenge', 'restart.verify', 'restart.commit');
  }
  async signOut() {
    await this.invalidateSync();
    if (this.state.session) await this.mutate('logout', 'POST', '/api/v2/wallet/auth/logout', { refresh_token: this.state.session.refresh_token, installation_id: this.installationId }, 'none');
    await this.login.logout(); this.state.credential = null; this.state.account = null; this.state.session = null;
    this.state.wallet = null; await this.save(); await this.finish('logout');
  }
}
