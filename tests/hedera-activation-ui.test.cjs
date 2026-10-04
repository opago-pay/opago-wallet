'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { hookFixture } = require('./react-hooks-fixture.cjs');

const publicKey = 'a'.repeat(64);
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...React.Children.toArray(node.props?.children).flatMap(nodes)];
}
const text = node => nodes(node).filter(item => item.type === 'text')
  .map(item => React.Children.toArray(item.props.children).join('')).join(' ');
const button = (screen, label) => nodes(screen).find(node => node.type === 'button' && text(node) === label);

function fixture(t, initial = {}) {
  const previousUrl = process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
  process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL = 'https://activation.example.test';
  t.after(() => {
    if (previousUrl === undefined) delete process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
    else process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL = previousUrl;
  });
  const calls = [];
  const auth = { hederaActivationBusy: false, hederaActivationJob: null, hederaActivationError: null,
    activateHederaAccount: async () => { calls.push('activate'); auth.hederaActivationBusy = true; }, ...initial };
  const app = hookFixture('components/receive/hedera-activation.tsx', () => ({
    'react-native': { View: 'view', Text: 'text', ActivityIndicator: 'loading', StyleSheet: { create: value => value }, Alert: { alert() {} } },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'button' },
    '@expo/vector-icons': { Ionicons: 'icon' },
    '@react-navigation/native': { useIsFocused: () => true },
    '@/hooks/useLanguage': { useLanguage() {} },
    '@/lib/i18n': { t: value => value },
    '@/hooks/useWalletAuth': { useWalletAuth: () => auth },
    '@/lib/hedera/keys': { normalizeHederaPublicKey: value => value },
    '@/lib/hedera/activation-errors': { ACTIVATION_ERROR_TEXT: { CONNECTION_UNAVAILABLE: 'Check your connection and try again.' } },
    'expo-clipboard': { setStringAsync: async value => calls.push(['copy', value]) },
  }), exports => exports.HederaActivation({ publicKey, network: 'MAINNET' }));
  t.after(app.unmount);
  return { ...app, auth, calls };
}

test('address setup starts with one clear action and keeps technical data collapsed', async t => {
  const app = fixture(t);
  let screen = app.render();
  assert.match(text(screen), /Your HBAR address/);
  assert.ok(button(screen, 'Create address'));
  assert.equal(nodes(screen).some(node => node.type === 'loading'), false);
  assert.doesNotMatch(text(screen), /MAINNET|Copy activation public key|aaaa/);
  const details = button(screen, 'Technical details');
  assert.equal(details.props.accessibilityState.expanded, false);
  details.props.onPress(); screen = app.render();
  assert.equal(button(screen, 'Technical details').props.accessibilityState.expanded, true);
  assert.match(text(screen), /MAINNET/);
  assert.ok(text(screen).includes(publicKey));
  await button(screen, 'Copy activation public key').props.onPress();
  assert.deepEqual(app.calls, [['copy', publicKey]]);
  button(screen, 'Technical details').props.onPress();
  assert.doesNotMatch(text(app.render()), /MAINNET|aaaa/);
});

test('creating an address clearly explains the wait and prevents another activation click', async t => {
  const app = fixture(t);
  button(app.render(), 'Create address').props.onPress();
  const screen = await app.settle();
  assert.deepEqual(app.calls, ['activate']);
  assert.match(text(screen), /Creating your address…/);
  assert.match(text(screen), /This can take a few minutes. Your address will appear here automatically./);
  assert.equal(button(screen, 'Create address'), undefined);
  assert.equal(button(screen, 'Check status'), undefined);
  assert.equal(nodes(screen).filter(node => node.type === 'loading').length, 1);
});

test('an activation still pending after polling offers a status check instead of another create action', async t => {
  const app = fixture(t, { hederaActivationJob: { job_id: 'pending-job', status: 'processing' } });
  const screen = app.render();
  assert.match(text(screen), /Your address is still being created/);
  assert.equal(button(screen, 'Create address'), undefined);
  assert.equal(nodes(screen).some(node => node.type === 'loading'), false);
  assert.doesNotMatch(text(screen), /pending-job/);
  button(screen, 'Check status').props.onPress(); await app.settle();
  assert.deepEqual(app.calls, ['activate']);
});

test('connection failures have a retry action and terminal jobs have a clear support message', async t => {
  const app = fixture(t, { hederaActivationError: 'CONNECTION_UNAVAILABLE' });
  let screen = app.render();
  assert.match(text(screen), /Check your connection and try again/);
  assert.ok(button(screen, 'Try again'));
  for (const status of ['failed', 'needs_review']) {
    app.auth.hederaActivationJob = { job_id: 'failed-job', status };
    screen = app.render();
    assert.match(text(screen), /Please contact Opago support/);
    assert.equal(button(screen, 'Try again'), undefined);
    assert.equal(button(screen, 'Check status'), undefined);
    assert.equal(nodes(screen).some(node => node.type === 'loading'), false);
  }
});

test('an unavailable activation service shows a plain explanation without a manual activation flow', t => {
  const app = fixture(t);
  delete process.env.EXPO_PUBLIC_HEDERA_ACTIVATION_API_URL;
  const screen = app.render();
  assert.match(text(screen), /Address setup is temporarily unavailable/);
  assert.equal(button(screen, 'Create address'), undefined);
  assert.doesNotMatch(text(screen), /Send your public key|Copy activation public key/);
});
