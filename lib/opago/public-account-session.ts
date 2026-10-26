import { PublicAccountClient, PublicAccountError, type PublicAccountSession } from './public-account';
import type { PrivateStore } from './store';

const SLOT = 'opago.public-customer-session.v1';
/** Separate secure storage; never read/write F3 credentials, seeds or wallet bindings. */
export class PublicAccountSessionStore {
  private generation = 0;
  private writes: Promise<unknown> = Promise.resolve();
  constructor(readonly client: PublicAccountClient, private readonly store: PrivateStore) {}
  invalidate() { this.generation++; }
  private write<T>(action: () => Promise<T>): Promise<T> {
    const result = this.writes.catch(() => undefined).then(action); this.writes = result; return result;
  }
  private capture(signal: AbortSignal, current: () => void) {
    const generation = ++this.generation;
    return () => {
      if (signal.aborted || this.generation !== generation) throw new PublicAccountError('cancelled');
      current();
    };
  }
  async login(email: string, password: string, signal: AbortSignal, current: () => void) {
    const check = this.capture(signal, current); check();
    await this.write(() => this.store.remove(SLOT)); check();
    const session = await this.client.login(email, password, signal); check();
    await this.write(async () => {
      check(); await this.store.write(SLOT, session);
      try { check(); } catch (cause) { await this.store.remove(SLOT); throw cause; }
    });
    check(); return session;
  }
  async resume(signal: AbortSignal, current: () => void) {
    const check = this.capture(signal, current); check(); await this.writes; check();
    const session = await this.store.read<PublicAccountSession>(SLOT); check();
    if (!session) { await this.client.configuration(signal); check(); return null; }
    try {
      const verified = await this.client.verify(session, signal); check(); return verified;
    } catch (cause) {
      check();
      if (cause instanceof PublicAccountError && ['expired', 'rejected'].includes(cause.problem)) await this.write(() => this.store.remove(SLOT));
      throw cause;
    }
  }
  async logout(session: PublicAccountSession | null, signal?: AbortSignal) {
    this.invalidate();
    await this.write(() => this.store.remove(SLOT));
    if (session) await this.client.logout(session, signal);
  }
}
