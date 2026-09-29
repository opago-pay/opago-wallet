'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { entropyToMnemonic } = require('bip39');
require('./register-typescript.cjs');
const {
  initialRecoveryInput, recoveryInputReducer: reduce, recoveryPhraseError, RECOVERY_WORD_COUNTS,
} = require('../lib/recovery-input.ts');

function enter(state, value) {
  return reduce(reduce(state, { type: 'change', value }), { type: 'next' });
}

function completed(count = 12) {
  // Public, deterministic test vectors; never use these words for a real wallet.
  const words = entropyToMnemonic('00'.repeat(count / 3 * 4)).split(' ');
  let state = reduce(initialRecoveryInput(), { type: 'select-count', count });
  for (const word of words) state = enter(state, word);
  return { state, words };
}

test('restores the exact word order for every supported BIP39 phrase length', () => {
  for (const count of RECOVERY_WORD_COUNTS) {
    const { state, words } = completed(count);
    assert.equal(state.stage, 'review');
    assert.deepEqual(state.words, words);
    assert.equal(state.error, null);
    assert.equal(recoveryPhraseError(state.words, count), null);
  }
});

test('rejects separators, multiple words, misspellings and empty entries without advancing', () => {
  for (const value of ['', ' ', 'abandon about', 'abandon,about', 'abandon;about', 'abandon\nabout', 'abandno']) {
    const start = reduce(initialRecoveryInput(), { type: 'select-count', count: 12 });
    const state = enter(start, value);
    assert.equal(state.index, 0);
    assert.equal(state.stage, 'enter');
    assert.ok(state.error);
    assert.equal(state.words[0], value, 'The user’s text must not be silently replaced');
  }
});

test('normalizes only casing and outer whitespace after explicit next', () => {
  const start = reduce(initialRecoveryInput(), { type: 'select-count', count: 12 });
  const state = enter(start, '  ABANDON  ');
  assert.equal(state.words[0], 'abandon');
  assert.equal(state.index, 1);
  assert.equal(state.error, null);
});

test('keeps earlier and unfinished words when going back and forward', () => {
  let state = reduce(initialRecoveryInput(), { type: 'select-count', count: 12 });
  state = enter(state, 'abandon');
  state = reduce(state, { type: 'change', value: 'abo' });
  state = reduce(state, { type: 'back' });
  assert.equal(state.index, 0);
  assert.equal(state.words[0], 'abandon');
  state = reduce(state, { type: 'next' });
  assert.equal(state.index, 1);
  assert.equal(state.words[1], 'abo');
});

test('blocks a phrase with valid dictionary words but an invalid checksum and permits correction', () => {
  let { state, words } = completed();
  state = reduce(state, { type: 'edit', index: 11 });
  state = enter(state, 'abandon');
  assert.equal(state.stage, 'review');
  assert.ok(state.error);
  assert.ok(recoveryPhraseError(state.words, 12));
  state = reduce(state, { type: 'edit', index: 11 });
  state = enter(state, words[11]);
  assert.equal(state.stage, 'review');
  assert.deepEqual(state.words, words);
  assert.equal(state.error, null);
});

test('does not accept an incomplete edit when returning to review', () => {
  let { state } = completed();
  state = reduce(state, { type: 'edit', index: 0 });
  state = reduce(state, { type: 'change', value: '' });
  state = reduce(state, { type: 'back' });
  assert.equal(state.stage, 'review');
  assert.ok(state.error);
  assert.ok(recoveryPhraseError(state.words, state.wordCount));
});

test('discards all recovery input on reset or a new phrase-length choice', () => {
  const { state } = completed();
  assert.deepEqual(reduce(state, { type: 'reset' }), initialRecoveryInput());
  const changed = reduce(state, { type: 'select-count', count: 24 });
  assert.deepEqual(changed.words, Array(24).fill(''));
  assert.equal(changed.index, 0);
  assert.equal(changed.stage, 'enter');
});
