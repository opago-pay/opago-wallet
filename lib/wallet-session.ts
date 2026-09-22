export const WALLET_IDLE_TIMEOUT_MS = 2 * 60_000;

// An authorization belongs to one unlocked session, never to a later unlock.
export class WalletSession {
  private unlocked = false;
  private generation = 0;
  private authorizationGeneration = 0;
  private lastActivity = 0;
  private foreground = true;
  private authentication: { preserveBackground: boolean; backgrounded: boolean } | null = null;
  private listeners = new Set<() => void>();

  constructor(private now: () => number = Date.now) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  isUnlocked() {
    if (this.unlocked && this.now() - this.lastActivity >= WALLET_IDLE_TIMEOUT_MS) this.lock();
    return this.unlocked;
  }

  unlock() {
    this.generation += 1;
    this.authentication = null;
    this.unlocked = true;
    this.lastActivity = this.now();
    this.listeners.forEach(listener => listener());
  }

  lock() {
    this.generation += 1;
    this.authentication = null;
    this.unlocked = false;
    this.listeners.forEach(listener => listener());
  }

  touch() {
    if (this.foreground && !this.authentication && this.isUnlocked()) this.lastActivity = this.now();
  }

  handleAppState(state: string) {
    this.foreground = state === 'active';
    if (state === 'background') {
      if (this.authentication?.preserveBackground && this.isUnlocked()) {
        this.authentication.backgrounded = true;
      } else this.lock();
    } else if (state === 'active') this.isUnlocked();
  }

  beginDeviceAuthentication(preserveBackground: boolean) {
    this.capture()();
    // An older payment approval must never survive a later authentication prompt.
    this.authorizationGeneration += 1;
    const generation = this.generation;
    const attempt = { preserveBackground, backgrounded: false };
    this.authentication = attempt;
    const cancel = () => {
      if (this.authentication !== attempt) return;
      this.authentication = null;
      this.authorizationGeneration += 1;
      if (attempt.backgrounded || !this.foreground) this.lock();
    };
    return {
      cancel,
      complete: () => {
        if (!this.isUnlocked() || !this.foreground || this.authentication !== attempt || generation !== this.generation) {
          cancel();
          throw new Error('Wallet locked. Review and authorize the payment again.');
        }
        this.authentication = null;
        this.touch();
        return this.capture();
      },
    };
  }

  capture() {
    if (!this.isUnlocked() || !this.foreground) throw new Error('Unlock your wallet to continue.');
    if (this.authentication) throw new Error('Device authentication is already in progress.');
    const generation = this.generation;
    const authorizationGeneration = this.authorizationGeneration;
    return () => {
      if (!this.isUnlocked() || !this.foreground || this.authentication || generation !== this.generation || authorizationGeneration !== this.authorizationGeneration) {
        throw new Error('Wallet locked. Review and authorize the payment again.');
      }
    };
  }

  // Only for authenticated SDK startup/read-only preparation, never signing/key disclosure.
  // A system credential prompt can temporarily hide an otherwise valid session.
  captureRuntime() {
    if (!this.isUnlocked()) throw new Error('Unlock your wallet to continue.');
    const generation = this.generation;
    return () => {
      if (!this.isUnlocked() || generation !== this.generation) {
        throw new Error('Wallet locked. Review and authorize the payment again.');
      }
    };
  }
}

export const walletSession = new WalletSession();
