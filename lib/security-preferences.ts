export const SECURITY_PREFERENCES_KEY = 'opago.security.preferences.v1';

export interface SecurityPreferencesStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

export type SecurityPreferencesSnapshot = {
  ready: boolean;
  lockOnOpen: boolean;
  authenticatePayments: boolean;
};

const defaults: SecurityPreferencesSnapshot = {
  ready: false,
  lockOnOpen: true,
  authenticatePayments: false,
};

export class SecurityPreferences {
  private snapshot = defaults;
  private listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private storage: SecurityPreferencesStorage | null = null;
  private saving: Promise<void> = Promise.resolve();

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(snapshot: SecurityPreferencesSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach(listener => listener());
  }

  initialize(storage: SecurityPreferencesStorage): Promise<void> {
    if (this.initialization) return this.initialization;
    this.storage = storage;
    this.initialization = (async () => {
      let saved: Partial<SecurityPreferencesSnapshot> = {};
      try {
        const raw = await storage.getItemAsync(SECURITY_PREFERENCES_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
        }
      } catch { /* Keep the opening lock if preferences are unreadable. */ }
      this.publish({
        ready: true,
        lockOnOpen: typeof saved.lockOnOpen === 'boolean' ? saved.lockOnOpen : true,
        authenticatePayments: typeof saved.authenticatePayments === 'boolean' ? saved.authenticatePayments : false,
      });
    })();
    return this.initialization;
  }

  set = (patch: Partial<Pick<SecurityPreferencesSnapshot, 'lockOnOpen' | 'authenticatePayments'>>): Promise<void> => {
    const save = this.saving.catch(() => undefined).then(async () => {
      await this.initialization;
      if (!this.storage) throw new Error('Security preferences are not ready.');
      const next = { ...this.snapshot, ...patch };
      await this.storage.setItemAsync(SECURITY_PREFERENCES_KEY, JSON.stringify({
        lockOnOpen: next.lockOnOpen,
        authenticatePayments: next.authenticatePayments,
      }));
      this.publish(next);
    });
    this.saving = save;
    return save;
  };
}

export const securityPreferences = new SecurityPreferences();
