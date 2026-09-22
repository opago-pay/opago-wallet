import {
  getEphemeralAnchorOutput, getNextHTLCTransactionSequence, getSigHashFromTx,
  getTxFromRawTxBytes, getTxId, maybeApplyFee, type KeyDerivation, type WalletConfigService,
} from '@buildonspark/spark-sdk';
import type { RequestedSigningCommitments, TreeNode, UserSignedTxSigningJob } from '@buildonspark/spark-sdk/proto/spark';
import { Script, ScriptNum, Transaction } from '@scure/btc-signer';
import { tapLeafHash } from '@scure/btc-signer/payment';
import { compareBytes, tapTweak } from '@scure/btc-signer/utils';
import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/curves/utils';
import { timeSendStep } from './send-timing';

type PublicPoint = (scalar: Uint8Array) => Promise<Uint8Array>;
// Same public BIP341 NUMS point and relative HTLC timeout as SDK 0.7.12.
const NUMS = hexToBytes('0250929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0');

/** Public-only BIP341 output calculation; scalar multiplication uses existing native Rust. */
export async function createLightningHtlcScript(
  hash: Uint8Array, receiver: Uint8Array, sender: Uint8Array, publicPoint: PublicPoint,
): Promise<Uint8Array> {
  if (hash.length !== 32 || receiver.length !== 33 || sender.length !== 33) {
    throw new Error('Invalid Lightning HTLC parameters.');
  }
  secp256k1.Point.fromHex(receiver).assertValidity();
  secp256k1.Point.fromHex(sender).assertValidity();
  const hashScript = Script.encode(['SHA256', hash, 'EQUALVERIFY', receiver.slice(1), 'CHECKSIG']);
  const timeScript = Script.encode([
    ScriptNum().encode(2160n), 'CHECKSEQUENCEVERIFY', 'DROP', sender.slice(1), 'CHECKSIG',
  ]);
  const leaves = [tapLeafHash(hashScript, 0xc0), tapLeafHash(timeScript, 0xc0)].sort(compareBytes);
  const root = schnorr.utils.taggedHash('TapBranch', leaves[0], leaves[1]);
  const tweak = tapTweak(NUMS.slice(1), root); // Includes the BIP341 curve-order check.
  if (tweak === 0n) throw new Error('Invalid Lightning HTLC tweak.');
  const point = await publicPoint(schnorr.utils.numberToBytesBE(tweak, 32));
  if (point.length !== 33 || (point[0] !== 2 && point[0] !== 3)) {
    throw new Error('Invalid Lightning HTLC point.');
  }
  const output = secp256k1.Point.fromHex(NUMS).add(secp256k1.Point.fromHex(point));
  output.assertValidity();
  return Script.encode([1, output.toBytes(true).slice(1)]);
}

function refundTransaction(node: Transaction, sequence: number, script: Uint8Array, fee: boolean): Transaction {
  const amount = node.getOutput(0).amount ?? 0n;
  const tx = new Transaction({ version: 3, allowUnknownOutputs: true });
  tx.addInput({ txid: hexToBytes(getTxId(node)), index: 0, sequence });
  tx.addOutput({ script, amount: fee ? maybeApplyFee(amount) : amount });
  if (!fee) tx.addOutput(getEphemeralAnchorOutput());
  return tx;
}

type Leaf = { leaf: TreeNode; keyDerivation: KeyDerivation; receiverIdentityPublicKey: Uint8Array };
type Result = {
  cpfpLeafSigningJobs: UserSignedTxSigningJob[];
  directLeafSigningJobs: UserSignedTxSigningJob[];
  directFromCpfpLeafSigningJobs: UserSignedTxSigningJob[];
};
type SigningService = {
  config: WalletConfigService;
  signRefundsInternal(tx: Transaction, hash: Uint8Array, leaf: Leaf,
    commitments: RequestedSigningCommitments['signingNonceCommitments'] | undefined): Promise<UserSignedTxSigningJob[]>;
  signRefundsForLightning(leaves: Leaf[], cpfp: RequestedSigningCommitments[], direct: RequestedSigningCommitments[],
    fromCpfp: RequestedSigningCommitments[], hash: Uint8Array): Promise<Result>;
};
const installed = new WeakSet<object>();

/**
 * Adapted from buildonspark/spark SDK 0.7.12 (Apache-2.0), signing.ts and
 * htlc-transactions.ts. Preserve transaction bytes, sighashes, commitment
 * association/order and original signRefundsInternal (fresh nonce + FROST).
 * Only public HTLC output calculation is native and reused within this call.
 * Unsupported platforms retain the complete original implementation.
 */
export function installSparkHtlcPreparation(value: unknown, signer: unknown): void {
  const service = value as SigningService | undefined;
  const native = signer as { getPublicKeyForPublicScalar?: PublicPoint } | undefined;
  if (!service || installed.has(service) || typeof service.signRefundsForLightning !== 'function' ||
      typeof service.signRefundsInternal !== 'function' || typeof native?.getPublicKeyForPublicScalar !== 'function') return;
  const publicPoint: PublicPoint = scalar => native.getPublicKeyForPublicScalar!(scalar);
  service.signRefundsForLightning = async function (leaves, cpfp, direct, fromCpfp, hash) {
    const result: Result = { cpfpLeafSigningJobs: [], directLeafSigningJobs: [], directFromCpfpLeafSigningJobs: [] };
    const scripts = new Map<string, Uint8Array>(); // Public data, invocation-local; no cross-payment cache.
    for (let index = 0; index < leaves.length; index++) {
      const leaf = leaves[index];
      if (!leaf?.leaf) throw new Error('Missing Lightning leaf.');
      const node = getTxFromRawTxBytes(leaf.leaf.nodeTx);
      const current = getTxFromRawTxBytes(leaf.leaf.refundTx);
      const sequence = current.getInput(0).sequence;
      if (sequence == null || current.getOutput(0).amount === undefined) throw new Error('Invalid Lightning refund.');
      const { nextSequence, nextDirectSequence } = getNextHTLCTransactionSequence(sequence);
      const directNode = leaf.leaf.directTx.length ? getTxFromRawTxBytes(leaf.leaf.directTx) : undefined;
      const sender = await this.config.signer.getIdentityPublicKey();
      const key = bytesToHex(hash) + ':' + bytesToHex(leaf.receiverIdentityPublicKey) + ':' + bytesToHex(sender);
      let script = scripts.get(key);
      if (!script) {
        script = await timeSendStep('htlc_output', () => createLightningHtlcScript(hash, leaf.receiverIdentityPublicKey, sender, publicPoint));
        scripts.set(key, script);
      }
      const cpfpTx = refundTransaction(node, nextSequence, script, false);
      const directTx = nextDirectSequence && directNode ? refundTransaction(directNode, nextDirectSequence, script, true) : undefined;
      const fromTx = refundTransaction(node, nextDirectSequence, script, true);
      result.cpfpLeafSigningJobs.push(...await this.signRefundsInternal(
        cpfpTx, getSigHashFromTx(cpfpTx, 0, node.getOutput(0)), leaf, cpfp[index]?.signingNonceCommitments,
      ));
      if (directTx && directNode) result.directLeafSigningJobs.push(...await this.signRefundsInternal(
        directTx, getSigHashFromTx(directTx, 0, directNode.getOutput(0)), leaf, direct[index]?.signingNonceCommitments,
      ));
      result.directFromCpfpLeafSigningJobs.push(...await this.signRefundsInternal(
        fromTx, getSigHashFromTx(fromTx, 0, node.getOutput(0)), leaf, fromCpfp[index]?.signingNonceCommitments,
      ));
    }
    return result;
  };
  installed.add(service);
}
