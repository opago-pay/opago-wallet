import type { OpagoAccount } from './account';
import type { HkaTransport } from './api';
import { v3Call } from './tx-api';
import { assertTxContract } from './tx-contract';
import { signV3Challenge, type V3Challenge, type V3ProofContext } from './tx-proof';
import { SyncError, syncKey, type SyncOwner, type TxAuthorization } from './tx-sync';
import { jcs } from './encoding';
type BoundWallet = { wallet_id: string; wallet_source: 'spark' | 'hedera'; source_wallet_id: string; network: 'mainnet' | 'testnet' | null;
  status: 'active' | 'inactive' | 'deleted'; ownership_epoch: number };
type Session = { wallet_id: string; installation_id: string; access_token: string; expires_at: string };
type Operation = { key: string; path: string; body: unknown; result?: unknown };
export type OwnershipPorts = { resolution: string; tenant: string; publicKey: string;
  consent(): Promise<() => void>; sign(bytes: Uint8Array): Promise<string>; assertCurrent(): void };
/** Independent v3 bind/session app workflow. Kept behind a reviewed signer and
 * network/ID/HPKE agreement; native bootstrap does not enable undecided rules.
 * Existing F3 OIDC, protected store, UUIDs and exclusive account queue are reused. */
export class V3WalletOwnership {
  private prefix: string;
  constructor(readonly account: OpagoAccount, readonly owner: SyncOwner, readonly transport: HkaTransport, readonly ports: OwnershipPorts) {
    if (account.api.transport.mode !== transport.mode || transport.mode === 'hka' && !ports.resolution) throw new SyncError('sync_backend_pending');
    this.prefix = syncKey(owner) + '.ownership';
  }
  private guard() {
    this.ports.assertCurrent();
    if (!this.ports.resolution) throw new SyncError('sync_backend_pending');
    if (this.account.state.credential?.subject !== this.owner.subject || this.account.installationId !== this.owner.installationId ||
      this.account.state.deletion || this.account.state.syncPaused || (this.account.state.syncGeneration || 0) !== this.owner.generation) throw new SyncError('sync_owner_changed');
  }
  private async mutate<T>(slot: string, path: string, body: unknown): Promise<T> {
    this.guard(); const key = this.prefix + '.' + slot;
    let operation = await this.account.store.read<Operation>(key); this.guard();
    if (operation && (operation.path !== path || jcs(operation.body) !== jcs(body))) throw new SyncError('sync_invalid_contract');
    if (operation && Object.hasOwn(operation,'result')) return operation.result as T;
    operation ||= { key: this.account.uuid(), path, body }; await this.account.store.write(key, operation); this.guard();
    const bearer = await this.account.bearer('account'); this.guard();
    const result = await v3Call<T>(this.transport, 'POST', path, body, 'account', bearer!, operation.key); this.guard();
    operation.result = result; await this.account.store.write(key, operation); this.guard(); return result;
  }
  private context(purpose: 'bind' | 'session'): V3ProofContext {
    return { purpose, tenant: this.ports.tenant, subject: this.owner.subject, source: this.owner.source,
      sourceWalletId: this.owner.sourceWalletId, network: this.owner.source === 'hedera' ? this.owner.network as 'mainnet' | 'testnet' : '-',
      installationId: purpose === 'session' ? this.owner.installationId : '-' };
  }
  private async proof(flow: 'bind' | 'session', body: unknown) {
    const challenge = await this.mutate<V3Challenge>(flow + '.challenge','/api/v3/wallets/challenges',body);
    if (Date.parse(challenge.expires_at) <= this.account.now()) {
      // Do not abandon an unknown bind/session outcome because its challenge expired.
      const commit = await this.account.store.read<Operation>(this.prefix + '.' + flow + '.commit'); this.guard();
      if (commit) return commit.body as { challenge_id: string; signature: string };
      await this.account.store.remove(this.prefix + '.' + flow + '.challenge');
      await this.account.store.remove(this.prefix + '.' + flow + '.proof'); throw new SyncError('challenge_invalid');
    }
    const cached = await this.account.store.read<{ challenge_id: string; signature: string }>(this.prefix + '.' + flow + '.proof'); this.guard();
    if (cached) { if (cached.challenge_id !== challenge.challenge_id) throw new SyncError('sync_invalid_contract'); return cached; }
    const proof = await signV3Challenge(challenge, this.context(flow), { ...this.ports, assertCurrent: () => this.guard() }, this.account.now());
    await this.account.store.write(this.prefix + '.' + flow + '.proof', proof); this.guard(); return proof;
  }
  private checkWallet(wallet: BoundWallet) {
    if (wallet.wallet_source !== this.owner.source || wallet.source_wallet_id !== this.owner.sourceWalletId || wallet.status !== 'active' ||
      this.owner.source === 'hedera' && wallet.network !== this.owner.network) throw new SyncError('sync_owner_changed');
  }
  bind() { return this.account.exclusive(async () => {
    this.guard();
    const bound = await this.account.store.read<BoundWallet>(this.prefix + '.wallet'); this.guard();
    if (bound) return this.readWallet(bound.wallet_id);
    const body = this.owner.source === 'hedera' ? { wallet_source: 'hedera', purpose: 'bind', network: this.owner.network,
      account_id: this.owner.sourceWalletId, public_key: this.ports.publicKey } : { wallet_source: 'spark', purpose: 'bind', identity_public_key: this.owner.sourceWalletId };
    const proof = await this.proof('bind',body);
    const wallet = await this.mutate<BoundWallet>('bind.commit','/api/v3/wallets',proof); this.checkWallet(wallet);
    await this.account.store.write(this.prefix + '.wallet',wallet); this.guard(); return wallet;
  }); }
  /** Explicit user approval only. Background recovery uses authorization(), which never signs. */
  proveSession(walletId: string) { return this.account.exclusive(async () => {
    const wallet = await this.readWallet(walletId); this.guard();
    const old = await this.account.store.read<Session>(this.prefix + '.session'); this.guard();
    if (old && Date.parse(old.expires_at) > this.account.now()) return this.authorization(walletId);
    const previous = await this.account.store.read<Operation>(this.prefix + '.session.commit'); this.guard();
    if (previous && Object.hasOwn(previous,'result') && Date.parse((previous.result as Session).expires_at) <= this.account.now()) {
      for (const suffix of ['session.commit','session.challenge','session.proof']) { await this.account.store.remove(this.prefix + '.' + suffix); this.guard(); }
    }
    const proof = await this.proof('session',{ purpose: 'session', wallet_id: walletId, installation_id: this.owner.installationId });
    const session = await this.mutate<Session>('session.commit','/api/v3/wallets/' + walletId + '/sessions',proof);
    if (session.wallet_id !== walletId || session.installation_id !== this.owner.installationId || Date.parse(session.expires_at) <= this.account.now()) throw new SyncError('sync_invalid_contract');
    await this.account.store.write(this.prefix + '.session',{ ...session, epoch: wallet.ownership_epoch }); this.guard();
    return this.authorization(walletId);
  }); }
  private async readWallet(id: string) {
    this.guard(); assertTxContract('Uuid',id); const bearer = await this.account.bearer('account'); this.guard();
    const wallet = await v3Call<BoundWallet>(this.transport,'GET','/api/v3/wallets/' + id,{},'account',bearer!); this.guard();
    if (wallet.wallet_id !== id) throw new SyncError('sync_owner_changed'); this.checkWallet(wallet); return wallet;
  }
  async authorization(walletId: string): Promise<TxAuthorization> {
    const wallet = await this.readWallet(walletId);
    const session = await this.account.store.read<Session & { epoch: number }>(this.prefix + '.session'); this.guard();
    if (!session || session.wallet_id !== walletId || session.installation_id !== this.owner.installationId ||
      session.epoch !== wallet.ownership_epoch || Date.parse(session.expires_at) <= this.account.now()) throw new SyncError('sync_session_expired');
    return { walletId, ownershipEpoch: wallet.ownership_epoch, source: this.owner.source, sourceWalletId: this.owner.sourceWalletId, network: this.owner.network,
      subject: this.owner.subject, installationId: this.owner.installationId, bearer: session.access_token, expiresAt: Date.parse(session.expires_at) };
  }
}
