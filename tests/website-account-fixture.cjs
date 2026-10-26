const { hookFixture } = require('./react-hooks-fixture.cjs');
const previous = new Set(Object.keys(require.cache));
require('./register-typescript.cjs');
const account = require('../lib/opago/website-account.ts');
const { createWebsiteBrowser } = require('../lib/opago/website-browser.ts');
const { websiteAccountAvailability } = require('../lib/opago/website-account-config.ts');
const { RuntimeConfigClient } = require('../lib/opago/runtime-config.ts');
const { WalletSession } = require('../lib/wallet-session.ts');
const { sanitizeNativeIntent } = require('../lib/native-intent.ts');
for (const file of Object.keys(require.cache)) if (file.endsWith('.ts') && !previous.has(file)) delete require.cache[file];
const tick = () => new Promise(resolve => setImmediate(resolve));
// Synthetic internal adapter values. These are NOT a proposed wire contract.
const ready = () => ({ status: 'ready', expiresAt: Date.now() + 60000,
  destinations: { login: 'https://website.example.test/sign-in', signup: 'https://website.example.test/create' } });
const config = () => ({ contract_version: '0.2.0', audience: 'https://api.opago.com', issued_at: new Date(Date.now() - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  valid_until: new Date(Date.now() + 60000).toISOString().replace(/\.\d{3}Z$/, 'Z'), cache_max_age: 300, min_supported_build: { ios: 14, android: 14 },
  revoked_signing_key_ids: [], revoked_kids: [],
  oidc: { issuer: 'https://legacy.example.test/realm', client_id: 'legacy', redirect_uris: ['opagowallet://oidc-callback'], scopes: ['openid', 'email', 'profile'] },
  limits: { min_sendable_msat: 1000, max_sendable_msat: 1000000000, photo_bytes: 10485760, photo_pixels: 24000000 } });
const response = data => ({ status: 200, contentType: 'application/json', cacheControl: 'no-store', body: JSON.stringify(data) });
function nativeFixture(options = {}) {
  const wallet = new WalletSession(options.now); wallet.unlock();
  const listeners = new Set(), opened = [], http = [], dismissed = [];
  const AppState = { currentState: 'active', addEventListener: (_, listener) => { listeners.add(listener); return { remove: () => listeners.delete(listener) }; } };
  const change = state => { AppState.currentState = state; wallet.handleAppState(state); for (const listener of [...listeners]) listener(state); };
  const module = hookFixture('lib/opago/website-account-native.ts', () => ({
    'react-native': { AppState, Platform: { OS: options.platform || 'android' } },
    'expo-application': { nativeBuildVersion: '14' },
    'expo-web-browser': { openBrowserAsync: async url => { opened.push(url); return options.open ? options.open(url) : { type: 'opened' }; },
      dismissBrowser: async () => { dismissed.push(true); } },
    './hka-http-native': { nativeHkaHttp: async (url, init) => { http.push({ url, ...init }); return options.http ? options.http(url, init) : response(config()); } },
    './settings-native': { nativeF3Enabled: () => options.enabled !== false },
    '../wallet-session': { walletSession: wallet }, './runtime-config': { RuntimeConfigClient },
    './website-account-config': { websiteAccountAvailability: options.availability || websiteAccountAvailability },
    './website-browser': { createWebsiteBrowser }, './website-account': account,
  }), exports => exports);
  const flow = module.render().nativeWebsiteAccount();
  return { wallet, AppState, change, opened, http, dismissed, flow, listeners };
}
module.exports = { account, createWebsiteBrowser, websiteAccountAvailability, RuntimeConfigClient, WalletSession, sanitizeNativeIntent,
  nativeFixture, ready, config, response, tick };
