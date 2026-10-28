const { hookFixture } = require('./react-hooks-fixture.cjs');
const { generateKeyPairSync, sign, createHash } = require('node:crypto');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const { BrokerAccountFlow } = require('../lib/opago/broker-account.ts');
const { OidcAccountLogin } = require('../lib/opago/oidc.ts');
const { createOidcBrowser } = require('../lib/opago/oidc-browser.ts');
const { createWalletBrokerVerifier } = require('../lib/opago/oidc-verifier.ts');
const { RuntimeConfigClient } = require('../lib/opago/runtime-config.ts');
const { MemoryPrivateStore } = require('../lib/opago/store.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
const { revokeWalletBrokerSession } = require('../lib/opago/broker-logout.ts');
const account = require('../lib/opago/website-account.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const tick = () => new Promise(resolve => setImmediate(resolve));
function nativeFixture(options = {}) {
  const wallet = new WalletSession(); wallet.unlock();
  const store = new MemoryPrivateStore(), opened = [], http = [], listeners = new Set();
  const origin = 'https://api.opago.com', slot = 'f3.oidc.' + origin;
  const AppState = { currentState: 'active', addEventListener: (_, listener) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const change = state => { AppState.currentState = state; wallet.handleAppState(state); for (const listener of [...listeners]) listener(state); };
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'synthetic-broker', alg: 'ES256', use: 'sig' };
  let nonce, sequence = 0, failConfig = false;
  const callback = url => { const request = new URL(url); nonce = request.searchParams.get('nonce'); return { type: 'success', url: request.searchParams.get('redirect_uri') + '?' + new URLSearchParams({ code: 'synthetic-code', state: request.searchParams.get('state'), iss: origin }) }; };
  const response = data => ({ status: 200, contentType: 'application/json', cacheControl: 'no-store', body: JSON.stringify(data) });
  function tokens() {
    const now = Math.floor(Date.now() / 1000);
    const common = { iss: origin, sub: '12345678-1234-4234-8234-123456789abc', azp: 'opago-wallet', iat: now, exp: now + 300, auth_time: now, amr: ['pwd'] };
    const jwt = (claims, typ) => {
      const body = Buffer.from(JSON.stringify({ alg: 'ES256', kid: jwk.kid, typ })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
      return body + '.' + sign('sha256', Buffer.from(body), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    };
    const access_token = jwt({ ...common, aud: 'opago-account', client_id: 'opago-wallet', roles: ['PrivateCustomer'], jti: 'synthetic-jti', scope: 'openid email profile' }, 'at+jwt');
    return { access_token, token_type: 'Bearer', refresh_token: 'synthetic-refresh-' + (++sequence),
      id_token: jwt({ ...common, aud: 'opago-wallet', nonce, email: 'synthetic@example.test', email_verified: true,
        at_hash: createHash('sha256').update(access_token).digest().subarray(0,16).toString('base64url') }, 'JWT') };
  }
  const nativeHkaHttp = async (url, init) => {
    http.push({ url, ...init });
    if (options.http) { const value = await options.http(url, init); if (value) return value; }
    if (url.endsWith('/app/config')) {
      if (failConfig) throw new Error('config unavailable');
      return response(require('./fixtures/wallet-app-config-2026-10-22.json'));
    }
    if (url.endsWith('openid-configuration')) return response(require('./fixtures/wallet-broker-discovery-2026-10-22.json'));
    if (url.endsWith('/jwks')) return response({ keys: [jwk] });
    if (url.endsWith('/token')) return response(tokens());
    if (url.endsWith('/revoke')) return { status: 200, contentType: '', body: '' };
    throw new Error('Unexpected request: ' + url);
  };
  const nativeOidcVerifierPorts = { json: async url => JSON.parse((await nativeHkaHttp(url, { method: 'GET' })).body), verifyRs256: async () => false };
  let dismissals = 0;
  const platform = hookFixture('lib/opago/oidc-native.ts', () => ({
    'react-native': { AppState }, './oidc-browser': { createOidcBrowser },
    'expo-web-browser': { openAuthSessionAsync: async url => { opened.push(url); return options.open ? options.open(url, callback) : callback(url); }, dismissAuthSession: () => { dismissals++; } },
    'expo-crypto': { getRandomValues: bytes => require('node:crypto').randomFillSync(bytes) },
    './hka-http-native': { nativeHkaHttp }, './encoding': require('../lib/opago/encoding.ts'),
    './broker-logout': { revokeWalletBrokerSession }, '../wallet-session': { walletSession: wallet },
  }), exports => exports.nativeOidcPlatform).render();
  const module = hookFixture('lib/opago/broker-account-native.ts', () => ({
    'react-native': { Platform: { OS: options.platform || 'android' } }, 'expo-application': { nativeBuildVersion: '18' },
    './hka-http-native': { nativeHkaHttp, nativeOidcVerifierPorts }, './runtime-config': { RuntimeConfigClient },
    './oidc-verifier': { createWalletBrokerVerifier }, './oidc-native': { nativeOidcPlatform: platform }, './oidc': { OidcAccountLogin },
    './store-native': { f3PrivateStore: store }, './broker-account': { BrokerAccountFlow }, './website-account': account,
    '../wallet-session': { walletSession: wallet }, './public-account-origin': { PUBLIC_API_ORIGIN: origin },
  }), exports => exports.nativeBrokerAccount()).render();
  return { flow: module, wallet, store, slot, opened, http, AppState, change, callback, failConfig: () => { failConfig = true; }, dismissals: () => dismissals };
}
module.exports = { nativeFixture, account, tick };
