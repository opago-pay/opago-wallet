export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'de'] as const;
export type AppLanguage = typeof SUPPORTED_LANGUAGES[number];
export const LANGUAGE_NAMES: Record<AppLanguage, string> = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch' };
export const LANGUAGE_LOCALES: Record<AppLanguage, string> = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', de: 'de-DE' };
export const LANGUAGE_STORAGE_KEY = 'opago_app_language';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function deviceLanguage(locale: string): AppLanguage {
  const base = locale.toLowerCase().split(/[-_]/)[0];
  return isAppLanguage(base) ? base : 'en';
}

export interface LanguageStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export class LanguagePreference {
  private snapshot: { language: AppLanguage; ready: boolean } = { language: 'en', ready: false };
  private listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private storage: LanguageStorage | null = null;
  private saving: Promise<void> = Promise.resolve();

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(language: AppLanguage) {
    this.snapshot = { language, ready: true };
    this.listeners.forEach(listener => listener());
  }

  initialize(storage: LanguageStorage, locale: string): Promise<void> {
    if (this.initialization) return this.initialization;
    this.storage = storage;
    this.initialization = (async () => {
      let language = deviceLanguage(locale);
      try {
        const saved = await storage.getItem(LANGUAGE_STORAGE_KEY);
        if (isAppLanguage(saved)) language = saved;
      } catch { /* A preference read failure must not prevent wallet access. */ }
      this.publish(language);
    })();
    return this.initialization;
  }

  setLanguage = (language: AppLanguage): Promise<void> => {
    if (!isAppLanguage(language)) return Promise.reject(new Error('Unsupported app language.'));
    const save = this.saving.catch(() => undefined).then(async () => {
      await this.initialization;
      if (!this.storage) throw new Error('Language preferences are not ready.');
      await this.storage.setItem(LANGUAGE_STORAGE_KEY, language);
      this.publish(language);
    });
    this.saving = save;
    return save;
  };
}

export const languagePreference = new LanguagePreference();
