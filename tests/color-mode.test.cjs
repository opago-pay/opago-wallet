'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./register-typescript.cjs');
const { COLOR_MODE_STORAGE_KEY, ColorModePreference, colorModePreference } = require('../lib/color-mode.ts');
const { adaptColor, adaptiveStyles } = require('../lib/theme-styles.ts');

test('day and night mode persist without changing wallet state and update existing styles', async () => {
  const values = new Map();
  const storage = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
  const fresh = new ColorModePreference();
  await fresh.initialize(storage);
  assert.equal(fresh.getSnapshot().mode, 'dark');
  await fresh.setMode('light');
  assert.equal(values.get(COLOR_MODE_STORAGE_KEY), 'light');
  const reopened = new ColorModePreference();
  await reopened.initialize(storage);
  assert.equal(reopened.getSnapshot().mode, 'light');

  await colorModePreference.initialize(storage);
  await colorModePreference.setMode('dark');
  const styles = adaptiveStyles({ screen: { backgroundColor: '#0a0a0c', color: '#fff' } });
  assert.equal(styles.screen.backgroundColor, '#0a0a0c');
  await colorModePreference.setMode('light');
  assert.equal(styles.screen.backgroundColor, '#ffffff');
  assert.equal(styles.screen.color, '#18181d');
  assert.equal(adaptColor('#ffb000', 'backgroundColor'), '#ffb000');
  await colorModePreference.setMode('dark');
  assert.equal(styles.screen.backgroundColor, '#0a0a0c');
});

test('a failed preference write leaves the current mode intact', async () => {
  const preference = new ColorModePreference();
  await preference.initialize({ getItem: async () => 'dark', setItem: async () => { throw new Error('storage failed'); } });
  await assert.rejects(preference.setMode('light'), /storage failed/);
  assert.equal(preference.getSnapshot().mode, 'dark');
});

test('Home loaded in light mode can switch back to true dark colors', async () => {
  const storage = { getItem: async () => 'light', setItem: async () => {} };
  await colorModePreference.initialize(storage);
  await colorModePreference.setMode('light');
  const source = fs.readFileSync(path.join(__dirname, '../app/(tabs)/index.tsx'), 'utf8');
  const styleStart = source.indexOf('const styles = adaptiveStyles(StyleSheet.create({');
  assert.ok(styleStart >= 0);
  const makeStyles = new Function('adaptiveStyles', 'StyleSheet', source.slice(styleStart) + '\nreturn styles;');
  const home = makeStyles(adaptiveStyles, { create: styles => styles });
  assert.equal(home.container.backgroundColor, '#ffffff');
  assert.equal(home.total.color, '#18181d');
  await colorModePreference.setMode('dark');
  assert.equal(home.container.backgroundColor, '#0a0a0c');
  assert.equal(home.total.color, '#fff');
  assert.equal(home.quickActionIcon.backgroundColor, '#141416');
  assert.equal(home.quickActionText.color, '#fff');
});
