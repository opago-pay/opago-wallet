import type { SparkWallet } from '@buildonspark/spark-sdk';
import type { OnchainOperation,OnchainWallet } from './types';
import { onchainJournal } from './journal-native';
import { onchainRequest } from './provider';
import { prepareRefundTransaction,verifyRefundTransaction,type RefundPlan } from './refund';
import { bitcoinStore } from '../bitcoin/store-native';
import { bitcoinScope } from '../bitcoin/onchain';
import { depositAmount } from '../bitcoin/chain-data';
import { appConfig } from '../config';
import { transferNetworkMatches } from './policy';

export async function prepareMoveRefund(wallet:OnchainWallet,spark:SparkWallet,operation:OnchainOperation,guard:()=>void):Promise<RefundPlan>{
  guard();
  if(operation.scope!==wallet.scope||!['to_lightning','refund'].includes(operation.kind)||!operation.txid||operation.vout===null||
    !transferNetworkMatches(wallet.network,appConfig.sparkNetwork)||operation.sparkScope!==await bitcoinScope(spark,appConfig.sparkNetwork))throw new Error('Wallet changed.');
  const deposit=(await bitcoinStore.list(operation.sparkScope)).find(row=>row.id===operation.sparkOperationId);guard();
  if(deposit?.state!=='action_required')throw new Error('This Bitcoin deposit is already being processed.');
  const [gross,address,fees]=await Promise.all([
    depositAmount(appConfig.sparkNetwork,operation.txid,operation.vout,operation.address),
    wallet.receiveAddress(),onchainRequest('/fee-estimates'),
  ]);guard();
  const rate=Math.ceil((JSON.parse(fees) as Record<string,number>)['6']);
  if(!Number.isSafeInteger(rate)||rate<1||rate>150)throw new Error('Bitcoin refund fee is unavailable.');
  // Spark SDK 0.7.12 uses 10 + 150 + 34 vbytes for its one-input, one-output refund.
  return prepareRefundTransaction(operation.txid,operation.vout,address,gross,rate*194,appConfig.sparkNetwork);
}
async function performMoveRefund(wallet:OnchainWallet,spark:SparkWallet,operation:OnchainOperation,plan:RefundPlan,guard:()=>void){
  guard();
  if(operation.scope!==wallet.scope||!['to_lightning','refund'].includes(operation.kind)||operation.network!==wallet.network||!transferNetworkMatches(wallet.network,appConfig.sparkNetwork)||operation.sparkScope!==await bitcoinScope(spark,appConfig.sparkNetwork))throw new Error('Wallet changed.');
  const journal=onchainJournal();
  let saved=(await journal.list(wallet.scope)).find(row=>row.id===operation.id);guard();
  if(!saved)throw new Error('Transfer not found.');
  const checked=saved.refund??plan;
  if(checked.depositTxid!==saved.txid||checked.vout!==saved.vout||!wallet.ownsAddress(checked.address))throw new Error('Refund must return to this Bitcoin wallet.');
  const rebuilt=prepareRefundTransaction(checked.depositTxid,checked.vout,checked.address,checked.grossSats,checked.feeSats,appConfig.sparkNetwork);
  if(rebuilt.txid!==checked.txid||rebuilt.amountSats!==checked.amountSats)throw new Error('Refund details changed.');
  if(saved.transferStage!=='refund_checking'){
    if(!Number.isSafeInteger(plan.expiresAt)||plan.expiresAt<=Date.now()||plan.depositTxid!==saved.txid||plan.vout!==saved.vout)throw new Error('The refund fee expired. Prepare it again.');
    // Record the deterministic refund txid before provider signing.
    saved=await journal.update(wallet.scope,saved.id,{transferStage:'refund_checking',refund:plan},{transferStage:'claim_required'});guard();
  }
  // This second durable lock is retried on EVERY resume. A crash between the two
  // stores never grants permission to sign, and the legacy claim screen races
  // against this same atomic update. A conflicting claim always wins safely.
  const locked=await bitcoinStore.update(saved.sparkScope!,saved.sparkOperationId!,previous=>{
    if (!previous || previous.txid!==saved!.txid || previous.vout!==saved!.vout) throw new Error('Deposit changed.');
    const intent=previous.refundIntent;
    if (intent?.operationId===saved!.id && intent.txid===saved!.refund!.txid && previous.state==='checking') return previous;
    if (intent || previous.state!=='action_required') throw new Error('This Bitcoin deposit is already being processed.');
    return {...previous,state:'checking',refundIntent:{operationId:saved!.id,txid:saved!.refund!.txid}};
  },guard);
  guard();
  if(locked.state!=='checking'||locked.refundIntent?.operationId!==saved.id)throw new Error('This Bitcoin deposit is already being processed.');
  const approved=saved.refund;
  if(!approved)throw new Error('Refund details are unavailable.');
  if(!approved.rawTransaction){
    guard();
    const raw=await spark.refundStaticDeposit({
      depositTransactionId:approved.depositTxid,outputIndex:approved.vout,destinationAddress:approved.address,fee:approved.feeSats,
    });
    guard();verifyRefundTransaction(raw,approved,appConfig.sparkNetwork);
    saved=await journal.update(wallet.scope,saved.id,{refund:{...approved,rawTransaction:raw}});guard();
  }
  const refund=saved.refund!;
  verifyRefundTransaction(refund.rawTransaction!,refund,appConfig.sparkNetwork);guard();
  const txid=(await onchainRequest('/tx',{method:'POST',headers:{'Content-Type':'text/plain'},body:refund.rawTransaction!})).trim();guard();
  if(txid!==refund.txid)throw new Error('Bitcoin refund broadcast could not be verified.');
  return saved;
}

const refundsInFlight=new Map<string,Promise<unknown>>();
export function submitMoveRefund(wallet:OnchainWallet,spark:SparkWallet,operation:OnchainOperation,plan:RefundPlan,guard:()=>void){
  const key=wallet.scope+':'+operation.id;
  const work=(refundsInFlight.get(key)||Promise.resolve()).catch(()=>undefined).then(()=>performMoveRefund(wallet,spark,operation,plan,guard));
  refundsInFlight.set(key,work);
  return work.finally(()=>{if(refundsInFlight.get(key)===work)refundsInFlight.delete(key);});
}
