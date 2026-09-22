import { KeyDerivationType, type KeyDerivation, type WalletConfigService } from '@buildonspark/spark-sdk';
import type {
  GetSigningCommitmentsResponse, InitiatePreimageSwapResponse, RequestedSigningCommitments,
  SparkServiceClient, StartTransferRequest, TreeNode, UserSignedTxSigningJob,
} from '@buildonspark/spark-sdk/proto/spark';
import { bytesToHex } from '@noble/curves/utils';
import { timeSendStep } from './send-timing';

type Leaf = { leaf: TreeNode; keyDerivation: KeyDerivation; newKeyDerivation: KeyDerivation; receiverIdentityPublicKey: Uint8Array };
type Jobs = { cpfpLeafSigningJobs: UserSignedTxSigningJob[]; directLeafSigningJobs: UserSignedTxSigningJob[]; directFromCpfpLeafSigningJobs: UserSignedTxSigningJob[] };
type Signer = { signRefunds(leaves: Leaf[], a: RequestedSigningCommitments[], b: RequestedSigningCommitments[], c: RequestedSigningCommitments[]): Promise<Jobs> };
type Connection = { createSparkClient(address: string): Promise<SparkServiceClient> };
type TransferService = { prepareTransferForLightning(leaves: Leaf[], hash: Uint8Array, expiry: Date, id: string): Promise<StartTransferRequest> };
type Params = {
  leaves: Leaf[]; paymentHash: Uint8Array; receiverIdentityPubkey: Uint8Array; isInboundPayment: boolean;
  transferID?: string; startTransferRequest?: StartTransferRequest;
};
type LightningService = {
  config: WalletConfigService; connectionManager: Connection; signingService: Signer;
  swapNodesForPreimage(params: Params): Promise<InitiatePreimageSwapResponse>;
};
type Prepared = { commitments: GetSigningCommitmentsResponse; jobs: Jobs };
type Outcome = { value: Prepared } | { cause: unknown };
type Context = {
  cancelled: boolean; leaves: Leaf[]; fingerprint: string; hash: string; id: string;
  request?: StartTransferRequest;
  preparation: Promise<Outcome>;
};

function fingerprint(leaves: Leaf[]): string | null {
  if (!leaves.length || leaves.some(item => item.keyDerivation.type !== KeyDerivationType.LEAF)) return null;
  // All public transaction/key data used by the normal refund signer. Do not
  // reuse prepared signatures if any of it changed while preparation awaited.
  return JSON.stringify(leaves.map(item => [item.leaf.id, item.keyDerivation.type === KeyDerivationType.LEAF ? item.keyDerivation.path : null,
    bytesToHex(item.leaf.nodeTx), bytesToHex(item.leaf.refundTx), bytesToHex(item.leaf.directTx),
    bytesToHex(item.leaf.verifyingPublicKey), bytesToHex(item.receiverIdentityPublicKey)]));
}

/**
 * Pinned SDK 0.7.12: two independent refund preparations were sequential.
 * Overlap only fresh commitment retrieval and LOCAL signing for the second
 * phase with transfer-package preparation. Keep the original SDK swap method
 * as the sole owner of the outbound RPC, invoice/fee data and idempotency key.
 * No global/prototype overrides and no cross-payment commitment/signature cache.
 */
export function installSparkLightningPipeline(transferValue: unknown, lightningValue: unknown): { close(): void } {
  const transfer = transferValue as TransferService | undefined;
  const lightning = lightningValue as LightningService | undefined;
  const inert = { close() {} };
  if (!transfer || !lightning || typeof transfer.prepareTransferForLightning !== 'function' ||
      typeof lightning.swapNodesForPreimage !== 'function' || !lightning.connectionManager || !lightning.signingService) return inert;
  const originalPrepare = transfer.prepareTransferForLightning;
  const originalSwap = lightning.swapNodesForPreimage;
  const pending = new WeakMap<StartTransferRequest, Context>();
  const consumed = new WeakSet<StartTransferRequest>();
  const active = new Set<Context>();
  let closed = false;
  function cancel(context: Context) {
    context.cancelled = true;
    if (context.request) pending.delete(context.request);
    context.request = undefined;
    active.delete(context);
  }
  function assertContext(context: Context) {
    if (closed || context.cancelled || fingerprint(context.leaves) !== context.fingerprint) {
      throw new Error('Lightning preparation is no longer current.');
    }
  }
  async function prepare(context: Context): Promise<Prepared> {
    const client = await lightning!.connectionManager.createSparkClient(lightning!.config.getCoordinatorAddress());
    assertContext(context);
    const commitments = await client.get_signing_commitments({ nodeIds: context.leaves.map(item => item.leaf.id), count: 3 });
    assertContext(context);
    const count = context.leaves.length;
    if (commitments.signingCommitments.length !== 3 * count) throw new Error('Incomplete Lightning signing commitments.');
    const jobs = await lightning!.signingService.signRefunds(context.leaves,
      commitments.signingCommitments.slice(0, count), commitments.signingCommitments.slice(count, 2 * count),
      commitments.signingCommitments.slice(2 * count));
    assertContext(context);
    return { commitments, jobs };
  }
  transfer.prepareTransferForLightning = async function (leaves, hash, expiry, id) {
    if (closed) throw new Error('Lightning preparation is closed.');
    const identity = fingerprint(leaves);
    // Bounded auxiliary work; unsupported SDK input retains its original path.
    if (identity === null || active.size >= 4) return originalPrepare.call(this, leaves, hash, expiry, id);
    const context: Context = { cancelled: false, leaves, fingerprint: identity, hash: bytesToHex(hash), id,
      preparation: Promise.resolve({ cause: new Error('Not started') }) };
    active.add(context);
    // Observe failure immediately, including if the other phase fails first.
    context.preparation = timeSendStep('preimage_prepare', () => prepare(context)).then(value => ({ value }), cause => ({ cause }));
    try {
      const request = await originalPrepare.call(this, leaves, hash, expiry, id);
      assertContext(context);
      context.request = request;
      pending.set(request, context);
      return request;
    } catch (cause) { cancel(context); throw cause; }
  };
  lightning.swapNodesForPreimage = async function (params) {
    const request = params.startTransferRequest;
    if (request && consumed.has(request)) throw new Error('Lightning preparation was already consumed.');
    const context = request ? pending.get(request) : undefined;
    if (closed) throw new Error('Lightning preparation is closed.');
    if (!context) return originalSwap.call(this, params);
    consumed.add(request!);
    pending.delete(request!); // The precomputed nonces/signatures are ONE use only.
    try {
      assertContext(context);
      if (params.isInboundPayment || params.transferID !== context.id || params.leaves !== context.leaves ||
          bytesToHex(params.paymentHash) !== context.hash ||
          params.leaves.some(item => bytesToHex(item.receiverIdentityPublicKey) !== bytesToHex(params.receiverIdentityPubkey))) {
        throw new Error('Lightning preparation does not match this transfer.');
      }
      let commitmentsUsed = false, jobsUsed = false;
      const getPrepared = async () => {
        const result = await context.preparation;
        assertContext(context);
        if ('cause' in result) throw result.cause;
        return result.value;
      };
      // Per-invocation views only. The real clients/services are never mutated.
      const scoped = Object.create(this) as LightningService;
      scoped.connectionManager = {
        createSparkClient: async address => {
          const client = await this.connectionManager.createSparkClient(address);
          // Use an empty facade so even frozen RPC clients can be wrapped
          // without violating Proxy invariants for their method properties.
          return new Proxy({} as SparkServiceClient, {
            get(_target, property) {
              if (property === 'get_signing_commitments') return async (input: { nodeIds: string[]; count: number }) => {
                if (commitmentsUsed || input.count !== 3 || JSON.stringify(input.nodeIds) !== JSON.stringify(context.leaves.map(item => item.leaf.id))) {
                  throw new Error('Unexpected Lightning commitment request.');
                }
                commitmentsUsed = true;
                return (await getPrepared()).commitments;
              };
              const value = Reflect.get(client, property, client);
              if (property === 'initiate_preimage_swap_v3') return (...args: unknown[]) => {
                assertContext(context);
                if (!commitmentsUsed || !jobsUsed) throw new Error('Lightning preparation is incomplete.');
                return Reflect.apply(value, client, args);
              };
              return typeof value === 'function' ? value.bind(client) : value;
            },
          });
        },
      };
      scoped.signingService = {
        signRefunds: async (leaves, a, b, c) => {
          const prepared = await getPrepared();
          const all = [...a, ...b, ...c];
          if (jobsUsed || !commitmentsUsed || leaves !== context.leaves || [a, b, c].some(group => group.length !== leaves.length) ||
              all.length !== prepared.commitments.signingCommitments.length ||
              all.some((item, index) => item !== prepared.commitments.signingCommitments[index])) {
            throw new Error('Unexpected Lightning signing request.');
          }
          jobsUsed = true;
          return prepared.jobs;
        },
      };
      return await originalSwap.call(scoped, params);
    } finally { cancel(context); }
  };
  return { close() { closed = true; for (const context of active) cancel(context); } };
}
