import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import { languagePreference, LANGUAGE_LOCALES, type AppLanguage } from './language';

export const dictionaries: Record<Exclude<AppLanguage, 'en'>, Record<string, string>> = { de, fr, es };
export type TranslationValues = Record<string, string | number>;

export function translate(language: AppLanguage, message: string, values: TranslationValues = {}): string {
  const dictionary = language === 'en' ? null : dictionaries[language];
  const template = dictionary && Object.prototype.hasOwnProperty.call(dictionary, message) ? dictionary[message] : message;
  // Replace only catalog placeholders, once. Wallet words, addresses and amounts
  // supplied as values are never translated, normalized, or interpreted as markup.
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);
}

export const t = (message: string, values?: TranslationValues): string => translate(languagePreference.getSnapshot().language, message, values);
export const appLocale = (): string => LANGUAGE_LOCALES[languagePreference.getSnapshot().language];
