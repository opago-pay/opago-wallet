'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');

test('iOS announcements cancel stale states, wait for foreground and stop on unmount', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const spoken = [];
  let message = 'Sending';
  let enabled = true;
  let onState;
  let removed = 0;
  const state = { currentState: 'active', addEventListener: (_, fn) => {
    onState = fn; return { remove() { removed++; } };
  } };
  const app = hookFixture('hooks/useAccessibleStatus.ts', () => ({
    'react-native': { Platform: { OS: 'ios' }, AppState: state,
      AccessibilityInfo: { announceForAccessibility: value => spoken.push(value) } },
  }), e => e.useAccessibleStatus(message, enabled));
  t.after(app.unmount);
  app.render();
  message = 'Sent'; app.render();
  t.mock.timers.tick(250);
  assert.deepEqual(spoken, ['Sent']);
  onState('active'); assert.deepEqual(spoken, ['Sent']);
  state.currentState = 'background'; message = 'Pending'; app.render();
  t.mock.timers.tick(250); assert.deepEqual(spoken, ['Sent']);
  state.currentState = 'active'; onState('active');
  assert.deepEqual(spoken, ['Sent', 'Pending']);
  message = 'Stale'; app.render(); enabled = false; app.render();
  t.mock.timers.tick(250); assert.equal(spoken.includes('Stale'), false);
  enabled = true; app.render(); app.unmount();
  t.mock.timers.tick(250); assert.equal(spoken.includes('Stale'), false);
  assert.ok(removed >= 3);
});

test('Android keeps native live regions instead of duplicate explicit announcements', t => {
  const app = hookFixture('hooks/useAccessibleStatus.ts', () => ({
    'react-native': { Platform: { OS: 'android' }, AccessibilityInfo: {
      announceForAccessibility() { assert.fail('duplicate Android announcement'); },
    } },
  }), e => e.useAccessibleStatus('Sent'));
  t.after(app.unmount); app.render();
});

test('heading focus follows visible content and cancels a hidden screen', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const focused = []; let visible = true; let key = 'first';
  const app = hookFixture('hooks/useAccessibleHeading.ts', () => ({
    '@react-navigation/native': { useIsFocused: () => visible },
    'react-native': { AppState: { currentState: 'active' }, findNodeHandle: node => node,
      AccessibilityInfo: { setAccessibilityFocus: node => focused.push(node) } },
  }), e => e.useAccessibleHeading(key));
  t.after(app.unmount);
  app.render().current = 42; t.mock.timers.tick(250);
  assert.deepEqual(focused, [42]);
  key = 'next'; app.render(); visible = false; app.render();
  t.mock.timers.tick(250); assert.deepEqual(focused, [42]);
});

test('native permission localization covers every app language without microphone access', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const config = require('../app.json').expo;
  const { getResolvedLocalesAsync } = require('@expo/config-plugins/build/utils/locales');
  const locales = await getResolvedLocalesAsync(root, config.locales, 'ios');
  assert.deepEqual(Object.keys(locales).sort(), ['de', 'en', 'es', 'fr', 'it']);
  for (const [language, strings] of Object.entries(locales)) {
    assert.ok(strings.NSCameraUsageDescription.length > 30, language);
    assert.ok(strings.NSFaceIDUsageDescription.length > 30, language);
    assert.equal(strings.NSMicrophoneUsageDescription, undefined);
    if (language !== 'en') assert.notEqual(strings.NSFaceIDUsageDescription, locales.en.NSFaceIDUsageDescription);
  }
  const camera = config.plugins.find(p => Array.isArray(p) && p[0] === 'expo-camera')[1];
  assert.equal(camera.microphonePermission, false);
  const auth = config.plugins.filter(p => Array.isArray(p) && ['expo-secure-store', 'expo-local-authentication'].includes(p[0]));
  assert.ok(auth.every(p => p[1].faceIDPermission === locales.en.NSFaceIDUsageDescription));
  const buy = fs.readFileSync(path.join(root, 'app/buy.tsx'), 'utf8');
  assert.match(buy, /<Redirect href="\/\(tabs\)"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'app/(tabs)/index.tsx'), 'utf8'), /label=\{t\('Buy'\)\}/);
});
