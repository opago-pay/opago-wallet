import { randomUUID } from 'expo-crypto';
import { OpagoApi, OpagoError, type HkaTransport } from './api';
import { OpagoAccount, type AccountLogin } from './account';
import { UmaSending, type UmaDisclosureProvider } from './uma';
import { nativeUmaPeer } from './peer-native';
import { f3PrivateStore } from './store-native';
import { MemoryPrivateStore } from './store';
import { walletSession } from '../wallet-session';
import { authorizeWalletAction } from '../device-authentication';
import { authorizePayment } from '../payment-authorization';
import { appConfig } from '../config';
import { decodeLightningInvoice } from '../lightning';
import { prepareSparkPayment, authorizeAndPayPreparedSparkPayment, type PreparedSparkPayment } from '../payments';
import { lightningPaymentLifecycle, reconcileLightningPayments } from '../lightning/reconcile-native';
import { lightningPaymentJournalFor } from '../lightning/payment-journal-native';
import type { BitcoinSparkWallet } from '../spark-bitcoin-wallet';
import { nativeF3Enabled } from './settings-native';

export type F3Integration = { hka: HkaTransport; accountLogin: AccountLogin; disclosure?: UmaDisclosureProvider; publicAddressOrigin: string;
  /** Jointly approved revision resolving 0.2.0 versus TRU's non-wait decision. */
  umaContractResolution?: string };
let integration: F3Integration | null = null;
let initializing: Promise<void> | null = null;
async function ensureIntegration() {
  if (integration) return;
  if (!nativeF3Enabled()) throw new Error('OPAGO backend integration is not configured.');
  initializing ||= (async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createNativeF3Integration } = require('./bootstrap-native') as typeof import('./bootstrap-native');
    installF3Integration(await createNativeF3Integration());
  })();
  try { await initializing; } catch (error) { initializing = null; throw error; }
}
/** Wire the existing HKA/OIDC integration here. No unknown root/key or old login format is accepted. */
export function installF3Integration(value: F3Integration) {
  if (value.hka.mode !== 'hka' || value.accountLogin.mode !== 'oidc' || value.disclosure && value.disclosure.mode !== 'backend') throw new Error('Only reviewed live integrations can be installed.');
  const origin = new URL(value.publicAddressOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== value.publicAddressOrigin || origin.username || origin.password) throw new Error('Invalid public address origin.');
  integration = value;
}
export function f3IntegrationAvailable() { return integration !== null || nativeF3Enabled(); }
export type F3Runtime = { account: OpagoAccount; uma: UmaSending; testOnly: boolean;
  startupError?: unknown;
  publicAddressOrigin: string;
  perform(action: () => Promise<unknown>): Promise<void>;
  prepare(): Promise<void>; confirm(): Promise<void>; reconcile(): Promise<void>;
  setTestKya?: (status: 'draft' | 'submitted' | 'in_review' | 'approved' | 'correction_requested' | 'rejected') => Promise<void> };
const live = new WeakMap<BitcoinSparkWallet, Promise<F3Runtime>>();
let test: Promise<F3Runtime> | null = null;
let accountOnly: Promise<F3Runtime> | null = null;
walletSession.subscribe(() => { test = null; accountOnly = null; });
async function buildRuntime(wallet: BitcoinSparkWallet | null, publicKey: string | null, testOnly: boolean): Promise<F3Runtime> {
  const assertCurrent = walletSession.captureRuntime();
  let account: OpagoAccount; let uma: UmaSending; let testKya: F3Runtime['setTestKya'];
  if (testOnly) {
    if (!__DEV__) throw new Error('Contract test adapter is unavailable in production.');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { F3ContractTestBackend } = require('./test-adapter') as typeof import('./test-adapter');
    const backend = new F3ContractTestBackend(new MemoryPrivateStore(), randomUUID,
      appConfig.isMainnet ? 'mainnet' : 'regtest');
    account = backend.createAccount(); uma = new UmaSending(account, backend.disclosure, backend.peer, decodeLightningInvoice);
    testKya = async status => { await backend.setKya(status); if (account.state.session) await account.refresh(); };
  } else {
    await ensureIntegration(); assertCurrent();
    if (!integration) throw new Error('OPAGO backend integration is not configured.');
    const configured = integration;
    const sparkKey = wallet ? await wallet.getIdentityPublicKey() : ''; assertCurrent();
    // Existing HKA transport owns all HPKE crypto. Guard lifecycle before and after requests.
    const guarded: HkaTransport = { mode: 'hka', request: async request => {
      assertCurrent(); const result = await configured.hka.request(request); assertCurrent(); return result;
    } };
    account = new OpagoAccount(new OpagoApi(guarded), f3PrivateStore, { publicKey: sparkKey, available: !!wallet,
      network: appConfig.isMainnet ? 'mainnet' : 'regtest', sign: async (challenge, intent, installationId) => {
        if (!wallet) throw new OpagoError('wallet_unavailable');
        const authorized = await authorizeWalletAction('Approve OPAGO wallet ownership');
        authorized(); const result = await wallet.signOpagoWalletChallenge(challenge, intent, appConfig.isMainnet ? 'mainnet' : 'regtest', installationId);
        authorized(); return result;
      } }, configured.accountLogin, randomUUID);
    const disclosure: UmaDisclosureProvider = configured.disclosure && configured.umaContractResolution ? configured.disclosure : {
      mode: 'backend', async review() { throw new Error('UMA integration awaits the agreed TRU contract and required data disclosure.'); },
      async assertCurrent() { throw new Error('UMA integration awaits the agreed TRU contract and required data disclosure.'); },
    };
    uma = new UmaSending(account, disclosure, nativeUmaPeer, decodeLightningInvoice);
  }
  await account.load(); await uma.load();
  const startupError = testOnly ? undefined : await account.refreshAfterLoad();
  assertCurrent();
  let prepared: PreparedSparkPayment | null = null;
  return { account, uma, testOnly, startupError, setTestKya: testKya, publicAddressOrigin: testOnly ? 'https://opago.com' : integration!.publicAddressOrigin,
    async perform(action) { await account.exclusive(async () => { assertCurrent(); await action(); assertCurrent(); }); },
    async prepare() {
      await uma.consentAndPrepare(uma.payment!.disclosure.id, async invoice => {
        if (testOnly) return 1;
        assertCurrent(); prepared = await prepareSparkPayment(wallet!, invoice.invoice, invoice.amountSats!); assertCurrent(); return prepared.maxFeeSats;
      });
    },
    async confirm() {
      if (!testOnly && (!prepared || prepared.invoice.paymentHash !== uma.payment?.invoice?.paymentHash)) throw new Error('Review the payment again.');
      await uma.confirm(async (payment, dispatch) => {
        if (testOnly) { await dispatch(); return 'Simulated payment — no funds transferred'; }
        assertCurrent();
        const journal = lightningPaymentJournalFor(appConfig.sparkNetwork, publicKey!);
        if ((await journal.list()).some(r => r.paymentHash === payment.invoice!.paymentHash && r.state !== 'failed')) throw new Error('Payment already submitted. Check its status.');
        const lifecycle = lightningPaymentLifecycle({ network: appConfig.sparkNetwork, publicKey: publicKey! });
        const result = await authorizeAndPayPreparedSparkPayment(wallet!, prepared!, authorizePayment, {
          ...lifecycle, async onPending(p) { await dispatch(); await lifecycle.onPending?.(p); },
        }, assertCurrent);
        return result.reference;
      });
    },
    async reconcile() {
      if (testOnly) return;
      await reconcileLightningPayments(wallet!, { network: appConfig.sparkNetwork, publicKey: publicKey! });
      await uma.reconcile(async hash => (await lightningPaymentJournalFor(appConfig.sparkNetwork, publicKey!).list()).find(r => r.paymentHash === hash)?.state || 'pending');
    },
  };
}
export function getF3Runtime(wallet: BitcoinSparkWallet | null, publicKey: string | null, testOnly = false): Promise<F3Runtime> {
  if (testOnly) { test ||= buildRuntime(null, null, true); return test; }
  if (!wallet) {
    accountOnly ||= buildRuntime(null, publicKey, false);
    accountOnly.catch(() => { accountOnly = null; });
    return accountOnly;
  }
  let runtime = live.get(wallet);
  if (!runtime) { runtime = buildRuntime(wallet, publicKey, false); live.set(wallet, runtime); runtime.catch(() => live.delete(wallet)); }
  return runtime;
}
