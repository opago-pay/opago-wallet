'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hookFixture } = require('./react-hooks-fixture.cjs');

for (const language of ['en', 'de']) {
  test(`account header and Android Back use the same settings destination (${language}) and clean up on blur`, t => {
    const calls = [];
    let focused = true; let back; let removals = 0;
    const router = { dismissTo: href => calls.push(href) };
    const ui = hookFixture('components/navigation/back-to-settings.tsx', hooks => ({
      'react-native': { StyleSheet: { create: value => value }, Keyboard: { dismiss: () => calls.push('dismissKeyboard') },
        BackHandler: { addEventListener: (event, handler) => { assert.equal(event, 'hardwareBackPress'); back = handler;
          return { remove: () => { back = undefined; removals++; } }; } } },
      '@expo/vector-icons': { Ionicons: 'Icon' },
      '@/components/ui/wallet-interaction': { TouchableOpacity: 'Button' },
      '@/hooks/useLanguage': { useLanguage() {} },
      '@/lib/i18n': { t: value => language === 'de' && value === 'Back' ? 'Zurück' : value },
      'expo-router': { useRouter: () => router, useNavigation: () => ({ getState: () => ({ index: 0, routes: [{ name: 'opago-account' }] }) }), useFocusEffect: callback => hooks.useEffect(() => focused ? callback() : undefined, [focused, callback]) },
    }), exports => exports.BackToSettings());
    t.after(() => ui.unmount());
    const button = ui.render();
    assert.equal(button.props.accessibilityRole, 'button');
    assert.equal(button.props.accessibilityLabel, language === 'de' ? 'Zurück' : 'Back');
    assert.equal(button.props.children.props.name, 'arrow-back');
    button.props.onPress();
    assert.equal(back(), true);
    assert.deepEqual(calls, ['dismissKeyboard', '/(tabs)/settings?section=overview', 'dismissKeyboard', '/(tabs)/settings?section=overview']);
    focused = false; ui.render();
    assert.equal(back, undefined); assert.equal(removals, 1);
    focused = true; ui.render(); assert.equal(back(), true);
    ui.unmount(); assert.equal(back, undefined); assert.equal(removals, 2);
  });
}

test('both public and contract account opt into Back while other OPAGO pages retain their existing close behavior', t => {
  const root = path.join(__dirname, '..');
  for (const file of ['app/opago-account.tsx', 'components/opago/public-account-screen.tsx']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /<OpagoPage backToSettings title="OPAGO account"/);
  }
  let props = { title: 'OPAGO account', busy: false, error: '', testOnly: false, backToSettings: true };
  const ui = hookFixture('components/opago/opago-ui.tsx', () => ({
    'react-native': { StyleSheet: { create: value => value }, ScrollView: 'Scroll', View: 'View', Text: 'Text' },
    '../navigation/back-to-settings': { BackToSettings: 'Back' },
    '../navigation/close-wallet-screen': { CloseWalletScreen: 'Close' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../hooks/useColorMode': { useColorMode() {} }, '../../hooks/useLanguage': { useLanguage() {} },
    '../../lib/theme-styles': { themeColor: () => '#fff' }, '../../lib/i18n': { t: value => value },
  }), exports => exports.OpagoPage(props));
  t.after(() => ui.unmount());
  assert.equal(ui.render().props.children[0].props.children[1].type, 'Back');
  props = { ...props, backToSettings: undefined };
  assert.equal(ui.render().props.children[0].props.children[1].type, 'Close');
});

// Use installed Expo routing action generation plus the actual React Navigation
// stack/tab reducers. Native rendering remains mocked; stack behavior is not.
function navigationFixture(t, origin) {
  const { StackRouter, StackActions, TabRouter, CommonActions } = require('@react-navigation/routers');
  const stack = StackRouter({ initialRouteName: '(tabs)' });
  const stackOptions = { routeNames: ['(tabs)', 'opago-account', 'pos-link', 'transaction-sync', 'uma-send'], routeParamList: {}, routeGetIdList: {} };
  const tabs = TabRouter({ initialRouteName: 'index', backBehavior: 'initialRoute' });
  const tabOptions = { routeNames: ['index', 'send', 'receive', 'settings'], routeParamList: {}, routeGetIdList: {} };
  let tabState = tabs.getInitialState(tabOptions);
  if (['settings', 'receive', 'send'].includes(origin)) {
    tabState = tabs.getStateForAction(tabState, CommonActions.navigate(origin, { section: 'overview', retained: 'entry-state' }), tabOptions);
  }
  let state = stack.getInitialState(stackOptions);
  state.routes[0] = { ...state.routes[0], state: tabState };
  if (['pos-link', 'transaction-sync', 'uma-send'].includes(origin)) {
    state = stack.getStateForAction(state, StackActions.push(origin, { retained: 'entry-state' }), stackOptions);
  }
  if (origin === 'account-only') state = { ...state, index: -1, routes: [] };
  if (origin === 'unhydrated-anchor') delete state.routes[0].state;
  const pushAccount = () => { state = stack.getStateForAction(state, StackActions.push('opago-account'), stackOptions); };
  pushAccount();
  const initialState = state;
  const actions = [];
  let unavailable = origin === 'undefined-state' || origin === 'empty-state';
  const navigation = { getState: () => unavailable ? origin === 'undefined-state' ? undefined : { routes: [], index: 0 } : state };
  const store = {
    navigationRef: { isReady: () => true, current: { getRootState: () => state } },
    getRouteInfo: () => ({}), redirects: [],
    linking: { config: {}, getStateFromPath: href => {
      assert.equal(href, '/(tabs)/settings?section=overview');
      return { routes: [{ name: '(tabs)', state: { routes: [{ name: 'settings', params: { section: 'overview' } }] } }] };
    } },
  };
  const dependencies = {
    'expo/dom': {}, 'expo-linking': {}, 'react-native': { Platform: { OS: 'android' } },
    './router-store': { store }, '../domComponents/emitDomEvent': { emitDomLinkEvent: () => false, emitDomGoBack: () => false },
    '../getRoutesRedirects': { applyRedirects: href => href },
    '../link/href': { resolveHref: href => href, resolveHrefStringWithSegments: href => href },
    '../matchers': { matchDynamicName: () => undefined },
    '../navigationParams': { appendInternalExpoRouterParams: params => params },
    '../utils/url': { shouldLinkExternally: () => false },
  };
  const routing = {};
  const source = fs.readFileSync(path.join(__dirname, '../node_modules/expo-router/build/global-state/routing.js'), 'utf8');
  new Function('require', 'exports', source)(name => {
    assert.ok(name in dependencies, `Unexpected Expo dependency ${name}`);
    return dependencies[name];
  }, routing);
  function flush() {
    unavailable = false;
    for (const action of routing.routingQueue.queue.splice(0)) {
      actions.push(action);
      const next = stack.getStateForAction(state, action, stackOptions);
      assert.ok(next, `Stack must handle ${action.type}`);
      state = next;
      const route = state.routes[state.index];
      // React Navigation delivers nested screen params to the child navigator.
      if (route.name === '(tabs)' && route.params?.screen) {
        const child = route.state || tabs.getInitialState(tabOptions);
        const nextChild = tabs.getStateForAction(child, CommonActions.navigate(route.params.screen, route.params.params), tabOptions);
        assert.ok(nextChild);
        state = { ...state, routes: state.routes.map((r, i) => i === state.index ? { ...r, state: nextChild } : r) };
      }
    }
  }
  const router = { back: () => { routing.goBack(); flush(); }, dismissTo: href => { routing.dismissTo(href); flush(); } };
  let hardwareBack;
  const ui = hookFixture('components/navigation/back-to-settings.tsx', hooks => ({
    'react-native': { StyleSheet: { create: value => value }, Keyboard: { dismiss() {} },
      BackHandler: { addEventListener: (_event, handler) => { hardwareBack = handler; return { remove() {} }; } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/ui/wallet-interaction': { TouchableOpacity: 'Button' },
    '@/hooks/useLanguage': { useLanguage() {} }, '@/lib/i18n': { t: value => value },
    'expo-router': { useRouter: () => router, useNavigation: () => navigation,
      useFocusEffect: callback => hooks.useEffect(callback, [callback]) },
  }), exports => exports.BackToSettings());
  t.after(() => ui.unmount());
  return { render: ui.render, back: () => hardwareBack(), getState: () => state, initialState, pushAccount, actions };
}

for (const origin of ['settings', 'receive', 'send', 'pos-link', 'transaction-sync', 'uma-send']) {
  test(`account Back preserves real ${origin} entry state and repeated openings do not duplicate routes`, t => {
    const f = navigationFixture(t, origin);
    const expected = f.initialState.routes.slice(0, -1);
    for (let round = 0; round < 3; round++) {
      const button = f.render();
      if (round % 2) assert.equal(f.back(), true); else button.props.onPress();
      assert.equal(f.actions.at(-1).type, 'GO_BACK');
      assert.deepEqual(f.getState().routes, expected);
      if (round < 2) f.pushAccount();
    }
  });
}

for (const origin of ['index', 'unhydrated-anchor', 'account-only', 'undefined-state', 'empty-state']) {
  test(`account ${origin} deep-link fallback opens settings overview instead of home or a duplicate account`, t => {
    const f = navigationFixture(t, origin);
    f.render(); assert.equal(f.back(), true);
    const state = f.getState();
    assert.equal(f.actions.at(-1).type, 'POP_TO');
    assert.deepEqual(state.routes.map(route => route.name), ['(tabs)']);
    const tabs = state.routes[0].state;
    assert.equal(tabs.routes[tabs.index].name, 'settings');
    assert.deepEqual(tabs.routes[tabs.index].params, { section: 'overview' });
    f.pushAccount();
    f.render().props.onPress();
    assert.equal(f.actions.at(-1).type, 'GO_BACK');
    assert.deepEqual(f.getState().routes, state.routes);
  });
}
