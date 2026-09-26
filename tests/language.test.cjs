'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
require('./register-typescript.cjs');
const { LanguagePreference, deviceLanguage, SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY } = require('../lib/i18n/language.ts');
const { translate, dictionaries } = require('../lib/i18n/index.ts');

test('bundled interface sources and catalogs contain valid UTF-8 without broken punctuation', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const broken = /\u00c2[\u00a0\u00b7]|\u00e2\u20ac|\u00e2\u0080|\ufffd/;
  const scan = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(filename);
      else if (/\.(?:[jt]sx?|json)$/.test(entry.name)) {
        assert.doesNotMatch(decoder.decode(fs.readFileSync(filename)), broken, filename);
      }
    }
  };
  for (const root of ['app', 'components', 'hooks', 'lib']) scan(path.join(__dirname, '..', root));
});

test('HBAR validation errors explain limits and invalid amounts in every supported language', async () => {
  const { languagePreference } = require('../lib/i18n/language.ts');
  const { friendlyPaymentMessage } = require('../lib/payment-errors.ts');
  await languagePreference.initialize({ getItem: async () => 'en', setItem: async () => {} }, 'en');
  try {
    for (const language of SUPPORTED_LANGUAGES) {
      await languagePreference.setLanguage(language);
      const capped = friendlyPaymentMessage(new Error('HBAR amount exceeds the configured mainnet transfer limit of 1 HBAR.'), 'HBAR');
      assert.match(capped, /1 HBAR/);
      assert.equal(capped, translate(language, 'This version allows up to {max} HBAR per payment. Enter a smaller amount.', { max: '1' }));
      const invalid = friendlyPaymentMessage(new Error('HBAR amount must use at most 8 decimal places.'), 'HBAR');
      assert.equal(invalid, translate(language, 'Enter a valid HBAR amount greater than zero, with at most 8 decimal places.'));
      if (language !== 'en') assert.notEqual(invalid, 'Enter a valid HBAR amount greater than zero, with at most 8 decimal places.');
    }
  } finally { await languagePreference.setLanguage('en'); }
});

test('language defaults recognize supported device regions and fall back to English', () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ['en', 'fr', 'es', 'de', 'it']);
  for (const [locale, expected] of [['de-DE','de'], ['fr_CA','fr'], ['es-MX','es'], ['it-IT','it'], ['it_CH','it'], ['en-US','en'], ['DE_at','de'], ['ja-JP','en'], ['', 'en']]) assert.equal(deviceLanguage(locale), expected);
});

test('saved app language survives a new app instance and overrides the device language', async () => {
  const values = new Map();
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); } };
  const first = new LanguagePreference();
  await first.initialize(storage, 'de-DE');
  assert.deepEqual(first.getSnapshot(), { language: 'de', ready: true });
  let changes = 0;
  const unsubscribe = first.subscribe(() => { changes++; });
  await first.setLanguage('fr');
  assert.equal(changes, 1);
  unsubscribe();
  assert.deepEqual([...values], [[LANGUAGE_STORAGE_KEY, 'fr']]);
  const restarted = new LanguagePreference();
  await restarted.initialize(storage, 'es-ES');
  assert.equal(restarted.getSnapshot().language, 'fr');
});

test('failed language saves retain the previous language and allow retry', async () => {
  let fail = true;
  const preference = new LanguagePreference();
  await preference.initialize({ getItem: async () => 'es', setItem: async () => { if (fail) throw new Error('disk unavailable'); } }, 'de');
  await assert.rejects(preference.setLanguage('de'), /disk unavailable/);
  assert.equal(preference.getSnapshot().language, 'es');
  fail = false;
  await preference.setLanguage('de');
  assert.equal(preference.getSnapshot().language, 'de');
  await assert.rejects(preference.setLanguage('invalid'), /Unsupported/);
});

test('language hydration tolerates corrupt or unavailable preference storage', async () => {
  for (const getItem of [async () => '{broken}', async () => { throw new Error('read unavailable'); }]) {
    const preference = new LanguagePreference();
    await preference.initialize({ getItem, setItem: async () => {} }, 'fr-CA');
    assert.deepEqual(preference.getSnapshot(), { language: 'fr', ready: true });
  }
});

test('overlapping language selections serialize durable writes in selection order', async () => {
  const writes = [];
  const preference = new LanguagePreference();
  await preference.initialize({ getItem: async () => null, setItem: async (key, value) => { writes.push(value); } }, 'en');
  await Promise.all([preference.setLanguage('de'), preference.setLanguage('es'), preference.setLanguage('fr')]);
  assert.deepEqual(writes, ['de', 'es', 'fr']);
  assert.equal(preference.getSnapshot().language, 'fr');
});

test('every translated message preserves placeholders in all supported languages', () => {
  const keys = Object.keys(dictionaries.de).sort();
  assert.ok(keys.length >= 330);
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const language of ['de', 'fr', 'es', 'it']) {
    assert.deepEqual(Object.keys(dictionaries[language]).sort(), keys);
    for (const key of keys) {
      const value = dictionaries[language][key];
      assert.ok(value.trim(), language + ': ' + key);
      assert.deepEqual(placeholders(value), placeholders(key), language + ': ' + key);
    }
  }
});

test('static UI messages have translations; only explicit brand names may use the English fallback', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ts = require('typescript');
  const unchangedBrands = new Set(['Bitcoin']);
  const messages = node => ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? [node.text]
    : ts.isConditionalExpression(node) ? [...messages(node.whenTrue), ...messages(node.whenFalse)] : [];
  const scan = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(filename);
      else if (/\.tsx?$/.test(filename)) {
        const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
        const visit = node => {
          if (ts.isCallExpression(node) && node.expression.getText(source) === 't' && node.arguments[0]) {
            for (const key of messages(node.arguments[0])) {
              if (unchangedBrands.has(key)) continue;
              for (const language of ['de', 'fr', 'es', 'it']) {
                assert.ok(Object.hasOwn(dictionaries[language], key), `${filename}: ${language}: ${key}`);
              }
            }
          }
          ts.forEachChild(node, visit);
        };
        visit(source);
      }
    }
  };
  for (const directory of ['app', 'components', 'hooks', 'lib']) scan(directory);
});

test('translations never translate or reinterpret recovery words and payment values', () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const word = 'abandon';
    assert.ok(translate(language, 'Word {number}, {word}', {number: 3, word}).endsWith(', abandon'));
    const address = '0.0.123456';
    assert.equal(translate(language, address), address);
    assert.ok(translate(language, 'Word {number}, {word}', {number: 3, word: '{number}'}).endsWith(', {number}'));
    assert.ok(translate(language, 'Send {amount} HBAR', {amount:'1.25000001'}).includes('1.25000001'));
    assert.equal(translate(language, '__proto__'), '__proto__');
    assert.equal(translate(language, 'constructor'), 'constructor');
  }
  assert.equal(translate('de', 'Loading balances…'), 'Guthaben werden geladen…');
  assert.equal(translate('fr', 'Send'), 'Envoyer');
  assert.equal(translate('es', 'Language'), 'Idioma');
  assert.equal(translate('it', 'Language'), 'Lingua');
  assert.equal(translate('en', 'Send'), 'Send');
});
