export const COLOR_MODE_STORAGE_KEY = 'opago_color_mode';
export type ColorMode = 'dark' | 'light';

export interface ColorModeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class ColorModePreference {
  private snapshot: { mode: ColorMode; ready: boolean } = { mode: 'dark', ready: false };
  private listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private storage: ColorModeStorage | null = null;
  private saving: Promise<void> = Promise.resolve();

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(mode: ColorMode) {
    this.snapshot = { mode, ready: true };
    this.listeners.forEach(listener => listener());
  }

  initialize(storage: ColorModeStorage): Promise<void> {
    if (this.initialization) return this.initialization;
    this.storage = storage;
    this.initialization = (async () => {
      let mode: ColorMode = 'dark';
      try {
        const saved = await storage.getItem(COLOR_MODE_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') mode = saved;
      } catch { /* Appearance preferences never block wallet access. */ }
      this.publish(mode);
    })();
    return this.initialization;
  }

  setMode = (mode: ColorMode): Promise<void> => {
    if (mode !== 'dark' && mode !== 'light') return Promise.reject(new Error('Unsupported color mode.'));
    const save = this.saving.catch(() => undefined).then(async () => {
      await this.initialization;
      if (!this.storage) throw new Error('Appearance preferences are not ready.');
      await this.storage.setItem(COLOR_MODE_STORAGE_KEY, mode);
      this.publish(mode);
    });
    this.saving = save;
    return save;
  };
}

export const colorModePreference = new ColorModePreference();
