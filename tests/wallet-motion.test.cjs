'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hookFixture } = require('./react-hooks-fixture.cjs');

function fixture(readPreference) {
  const events = {};
  const removed = [];
  const app = hookFixture('hooks/useWalletMotion.ts', () => ({
    'react-native': {
      AccessibilityInfo: {
        isReduceMotionEnabled: readPreference,
        addEventListener: (name, fn) => { events[name] = fn; return { remove: () => removed.push(name) }; },
      },
      AppState: {
        currentState: 'active',
        addEventListener: (name, fn) => { events[name] = fn; return { remove: () => removed.push(name) }; },
      },
    },
  }), module => module.useWalletMotion());
  return { ...app, events, removed };
}

test('decorative wallet motion waits for the preference, pauses in background and removes listeners', async () => {
  const app = fixture(async () => false);
  assert.equal(app.render(), false);
  assert.equal(await app.settle(), true);
  app.events.change('inactive'); assert.equal(app.render(), false);
  app.events.change('background'); assert.equal(app.render(), false);
  app.events.change('active'); assert.equal(app.render(), true);
  app.events.reduceMotionChanged(true); assert.equal(app.render(), false);
  app.events.change('background'); app.events.change('active'); assert.equal(app.render(), false);
  app.events.reduceMotionChanged(false); assert.equal(app.render(), true);
  app.unmount(); assert.deepEqual(app.removed.sort(), ['change', 'reduceMotionChanged']);
});

test('a late preference read cannot override a newer Reduce Motion event', async t => {
  let finish;
  const app = fixture(() => new Promise(resolve => { finish = resolve; }));
  t.after(app.unmount);
  app.render(); app.events.reduceMotionChanged(true); finish(false);
  assert.equal(await app.settle(), false);
});

test('unavailable accessibility preference keeps motion reduced', async t => {
  const app = fixture(async () => { throw new Error('unavailable'); });
  t.after(app.unmount);
  assert.equal(await app.settle(), false);
});
