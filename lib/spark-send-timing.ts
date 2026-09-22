import { sendTimingEnabled, timeSendStep, type SendTimingStage } from './send-timing';

type Target = Record<string, unknown>;
const wrapped = new WeakMap<object, Set<string>>();

function target(value: unknown): Target | null {
  return value !== null && typeof value === 'object' ? value as Target : null;
}

function hook(value: unknown, method: string, stage: SendTimingStage): void {
  const object = target(value);
  if (!object || wrapped.get(object)?.has(method)) return;
  const original = object[method];
  if (typeof original !== 'function') return;
  try {
    object[method] = function (this: unknown, ...args: unknown[]) {
      return timeSendStep(stage, () => Reflect.apply(original, this, args));
    };
    const methods = wrapped.get(object) ?? new Set<string>();
    methods.add(method);
    wrapped.set(object, methods);
  } catch { /* Optional diagnostics cannot block a payment. */ }
}

function hookOperatorClient(client: unknown): void {
  hook(client, 'query_nodes', 'operator_query');
  hook(client, 'get_signing_commitments', 'operator_commitments');
  hook(client, 'initiate_preimage_swap_v3', 'operator_swap');
  hook(client, 'initiate_swap_primary_transfer', 'operator_swap');
  for (const method of ['start_transfer_v2', 'start_transfer_v3', 'finalize_node_signatures_v2', 'finalize_transfer_with_transfer_package']) {
    hook(client, method, 'operator_transfer');
  }
  for (const method of ['claim_transfer', 'claim_transfer_sign_refunds_v2', 'claim_transfer_tweak_keys']) {
    hook(client, method, 'operator_claim');
  }
}

/** Opt-in, pinned SDK 0.7.12 structure. No request/response data is inspected. */
export function attachSparkSendTiming(value: unknown): void {
  if (!sendTimingEnabled()) return;
  const wallet = target(value);
  if (!wallet) return;
  hook(wallet, 'getBitcoinBalance', 'bitcoin_balance');
  hook(wallet, 'payLightningInvoice', 'sdk_send');
  hook(wallet, 'getLightningSendFeeEstimate', 'fee_quote');
  hook(wallet.leafManager, 'selectLeavesWithSwap', 'leaves_select');
  hook(wallet.leafManager, 'checkRenewLeaves', 'leaves_renew');
  hook(wallet.leafManager, 'handleTransferEvent', 'local_transfer_update');
  hook(wallet.swapService, 'requestLeavesSwap', 'leaves_swap');
  hook(wallet.transferService, 'prepareTransferForLightning', 'transfer_prepare');
  hook(wallet.transferService, 'sendSwapTransfer', 'swap_prepare');
  hook(wallet.transferService, 'claimTransfer', 'transfer_claim');
  hook(wallet.lightningService, 'swapNodesForPreimage', 'preimage_swap');
  hook(wallet.sspClient, 'requestLightningSend', 'ssp_send');
  hook(wallet.sspClient, 'requestLeavesSwap', 'ssp_swap');
  hook(wallet.sspClient, 'authenticate', 'ssp_auth');
  hook(wallet.sspClient, 'executeRawQuery', 'ssp_query');
  hook(wallet.signingService, 'signRefunds', 'refund_signing');
  hook(wallet.signingService, 'signRefundsForLightning', 'refund_signing');
  hook(wallet.signingService, 'signRefundsForClaim', 'refund_signing');
  hook(wallet.signingService, 'signSigningJobs', 'signing_jobs');
  const signer = target(wallet.config)?.signer;
  hook(signer, 'getPublicKeyFromDerivation', 'signer_public_key');
  hook(signer, 'getRandomSigningCommitment', 'signer_commitment');
  hook(signer, 'signFrost', 'signer_frost');
  hook(signer, 'aggregateFrost', 'signer_aggregate');
  hook(signer, 'subtractSplitAndEncrypt', 'signer_key_tweak');
  hook(signer, 'getPublicKeyForPublicScalar', 'public_curve');
  const connection = target(wallet.connectionManager);
  if (!connection) return;
  hook(connection, 'authenticate', 'operator_auth');
  hook(connection, 'createSparkClient', 'operator_client');
  const original = connection.createSparkClient;
  if (typeof original !== 'function' || wrapped.get(connection)?.has('client_observer')) return;
  try {
    connection.createSparkClient = function (this: unknown, ...args: unknown[]) {
      const promise = Reflect.apply(original, this, args);
      if (promise instanceof Promise) {
        void promise.then(client => {
          try { hookOperatorClient(client); } catch { /* Observer only. */ }
        }, () => {});
      }
      return promise;
    };
    wrapped.get(connection)?.add('client_observer');
  } catch { /* Keep existing SDK behavior if instrumentation is unsupported. */ }
}
