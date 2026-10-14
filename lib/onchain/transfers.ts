import type { SparkWallet } from '@buildonspark/spark-sdk';
import { bitcoinScope, prepareBitcoinWithdrawal, submitBitcoinWithdrawal, reconcileBitcoinWithdrawals, type PreparedBitcoinWithdrawal } from '../bitcoin/onchain';
import { discoverBitcoinDeposits, prepareBitcoinDeposit, claimBitcoinDeposit, type BitcoinDepositQuote } from '../bitcoin/deposits';
import { bitcoinStore, bitcoinDepositCursor, bitcoinRequestCursor, bitcoinDepositWatch } from '../bitcoin/store-native';
import { validateBitcoinAddress } from '../bitcoin/destination';
import { depositAmount } from '../bitcoin/chain-data';
import { appConfig } from '../config';
import { onchainJournal } from './journal-native';
import { transferNetworkMatches } from './policy';
import type { OnchainOperation, OnchainQuote, OnchainWallet } from './types';

export type MoveQuote =
  {direction:'to_lightning'; onchain:OnchainQuote; sparkScope:string} |
  {direction:'from_lightning'; onchainScope:string; spark:PreparedBitcoinWithdrawal};

async function matchingWallets(onchain:OnchainWallet,spark:SparkWallet,guard:()=>void) {
  guard();
  if(!transferNetworkMatches(onchain.network,appConfig.sparkNetwork))throw new Error('Bitcoin and Lightning must use the same network.');
  const scope=await bitcoinScope(spark,appConfig.sparkNetwork);guard();return scope;
}
export async function prepareMove(onchain:OnchainWallet,spark:SparkWallet,direction:MoveQuote['direction'],amountSats:number,guard:()=>void):Promise<MoveQuote> {
  const scope=await matchingWallets(onchain,spark,guard);
  if(direction==='to_lightning'){
    const address=validateBitcoinAddress(await spark.getStaticDepositAddress(),appConfig.sparkNetwork);guard();
    const owned=await spark.queryStaticDepositAddresses();guard();
    if(!owned.includes(address))throw new Error('Lightning deposit address could not be verified.');
    const quote=await onchain.prepare(address,amountSats,guard);guard();
    return {direction,onchain:quote,sparkScope:scope};
  }
  const address=await onchain.receiveAddress();guard();
  return {direction,onchainScope:onchain.scope,spark:await prepareBitcoinWithdrawal(
    spark,appConfig.sparkNetwork,address,amountSats,guard,bitcoinStore,bitcoinRequestCursor)};
}
export async function submitMove(onchain:OnchainWallet,spark:SparkWallet,quote:MoveQuote,guard:()=>void):Promise<OnchainOperation> {
  const scope=await matchingWallets(onchain,spark,guard);
  const journal=onchainJournal();
  if(quote.direction==='to_lightning'){
    if(quote.sparkScope!==scope || quote.onchain.scope!==onchain.scope)throw new Error('Wallet changed.');
    const owned=await spark.queryStaticDepositAddresses();guard();
    if(!owned.includes(quote.onchain.address))throw new Error('Lightning deposit address changed.');
    await bitcoinDepositWatch.enable(scope,guard);guard();
    return onchain.send(quote.onchain,guard,'to_lightning',{
      scope,operationId:`deposit:${appConfig.sparkNetwork}:${quote.onchain.txid}:${quote.onchain.vout}`,
    });
  }
  if(quote.onchainScope!==onchain.scope || quote.spark.scope!==scope || !onchain.ownsAddress(quote.spark.address))throw new Error('Wallet changed.');
  const now=new Date().toISOString();
  const operation:OnchainOperation={version:1,id:'move:'+quote.spark.quoteId,scope:onchain.scope,network:onchain.network,kind:'from_lightning',state:'prepared',
    quote:null,withdrawalQuote:quote.spark,address:quote.spark.address,amountSats:quote.spark.amountSats,feeSats:quote.spark.feeSats,txid:null,vout:null,rawTransaction:null,
    createdAt:now,updatedAt:now,sparkScope:scope,sparkOperationId:'withdraw:'+quote.spark.quoteId,transferStage:'waiting_onchain'};
  // Link the approved quote before the SDK can create a provider request.
  await journal.reserve(operation);guard();
  await journal.update(onchain.scope,operation.id,{state:'broadcast_pending'});guard();
  const withdrawal=await submitBitcoinWithdrawal(spark,bitcoinStore,quote.spark,guard,bitcoinRequestCursor);guard();
  return journal.update(onchain.scope,operation.id,{
    txid:withdrawal.txid??null,state:withdrawal.state==='aborted'?'aborted':withdrawal.txid?'broadcast':'broadcast_pending',
  });
}
export async function reconcileMoves(onchain:OnchainWallet,spark:SparkWallet,guard:()=>void):Promise<OnchainOperation[]> {
  const scope=await matchingWallets(onchain,spark,guard);
  const journal=onchainJournal();
  const moves=(await journal.list(onchain.scope)).filter(row=>row.transferStage && row.state!=='aborted');
  guard();if(!moves.length)return moves;
  await Promise.all([
    onchain.sync(),
    discoverBitcoinDeposits(spark,bitcoinStore,appConfig.sparkNetwork,guard,bitcoinRequestCursor,bitcoinDepositCursor),
    reconcileBitcoinWithdrawals(spark,bitcoinStore,scope,guard,bitcoinRequestCursor),
  ]);guard();
  const sparkOperations=await bitcoinStore.list(scope);guard();
  const transactions=await onchain.transactions();guard();
  for(const move of moves){
    if(move.sparkScope!==scope)throw new Error('Wallet changed.');
    const provider=sparkOperations.find(row=>row.id===move.sparkOperationId);
    if(move.refund){
      if(provider?.state==='confirmed'&&provider.transferId){
        await journal.update(onchain.scope,move.id,{transferStage:'completed',sparkTransferId:provider.transferId,claimFeeSats:provider.feeSats??null});
        continue;
      }
      const refunded=transactions.find(tx=>tx.txid===move.refund!.txid&&tx.confirmed&&tx.outputs.some(output=>output.owned&&output.address===move.refund!.address&&output.valueSats===move.refund!.amountSats));
      if(refunded){
        await journal.update(onchain.scope,move.id,{transferStage:'refunded'});
        if(provider)await bitcoinStore.update(scope,provider.id,previous=>({...previous!,state:'refunded'}),guard);
      }else if(move.transferStage==='refunded'){
        await journal.update(onchain.scope,move.id,{transferStage:'refund_checking'});
        if(provider?.state==='refunded')await bitcoinStore.update(scope,provider.id,previous=>({...previous!,state:'checking'}),guard);
      }
      continue;
    }
    if(!provider)continue;
    if(move.kind==='from_lightning'&&provider.state==='aborted'){await journal.update(onchain.scope,move.id,{state:'aborted'});continue;}
    if(move.kind==='to_lightning'||move.kind==='refund'){
      if(move.transferStage==='refund_checking'||move.transferStage==='refunded')continue;
      if(provider.state==='action_required'){
        await journal.update(onchain.scope,move.id,{transferStage:'claim_required'},{transferStage:move.transferStage});
      }else if(provider.state==='confirmed' && provider.transferId){
        // A completed transfer is provider evidence; read available leaves too.
        await spark.getBalance();guard();
        await journal.update(onchain.scope,move.id,{transferStage:'completed',claimFeeSats:provider.feeSats??null,sparkTransferId:provider.transferId},{transferStage:move.transferStage});
      }else if(['checking','pending'].includes(provider.state)){
        await journal.update(onchain.scope,move.id,{transferStage:'claim_checking'},{transferStage:move.transferStage});
      }
    }else if(move.kind==='from_lightning' && provider.txid){
      const transaction=transactions.find(tx=>tx.txid===provider.txid);
      const output=transaction?.outputs.find(item=>item.owned&&item.address===move.address&&item.valueSats===move.amountSats);
      await journal.update(onchain.scope,move.id,{txid:provider.txid,vout:output?.vout??null,
        ...(provider.actualFeeSats !== undefined ? {actualFeeSats:provider.actualFeeSats} : {}),
        state:transaction?.confirmed&&output?'confirmed':'broadcast',
        transferStage:transaction?.confirmed&&output&&provider.state==='confirmed'?'completed':'waiting_onchain'});
    }
    guard();
  }
  return journal.list(onchain.scope);
}
export async function prepareMoveClaim(onchain:OnchainWallet,spark:SparkWallet,operation:OnchainOperation,guard:()=>void):Promise<BitcoinDepositQuote>{
  const scope=await matchingWallets(onchain,spark,guard);
  if(operation.scope!==onchain.scope || operation.sparkScope!==scope || !['to_lightning','refund'].includes(operation.kind))throw new Error('Wallet changed.');
  const deposit=(await bitcoinStore.list(scope)).find(row=>row.id===operation.sparkOperationId);guard();
  if(!deposit || deposit.txid!==operation.txid || deposit.vout!==operation.vout)throw new Error('Bitcoin confirmation is still pending.');
  return prepareBitcoinDeposit(spark,deposit,guard);
}
export async function submitMoveClaim(onchain:OnchainWallet,spark:SparkWallet,operation:OnchainOperation,quote:BitcoinDepositQuote,guard:()=>void){
  await matchingWallets(onchain,spark,guard);
  if(quote.operation.id!==operation.sparkOperationId || quote.operation.txid!==operation.txid || quote.operation.vout!==operation.vout)throw new Error('Deposit changed.');
  await onchainJournal().update(onchain.scope,operation.id,{transferStage:'claim_checking'},{transferStage:'claim_required'});guard();
  await claimBitcoinDeposit(spark,bitcoinStore,quote,guard);
}

/** Old Spark addresses remain recoverable after upgrade/seed restore. The
 * imported deposit is explicitly distinct from a transfer funded by this BIP84 wallet. */
export async function importLegacyDeposit(onchain:OnchainWallet,spark:SparkWallet,id:string,guard:()=>void):Promise<OnchainOperation>{
  const scope=await matchingWallets(onchain,spark,guard);
  const journal=onchainJournal();
  const existing=(await journal.list(onchain.scope)).find(row=>row.sparkScope===scope&&row.sparkOperationId===id);
  guard();if(existing)return existing;
  const deposit=(await bitcoinStore.list(scope)).find(row=>row.id===id&&row.kind==='deposit');
  if(!deposit?.txid||deposit.vout===undefined||deposit.state!=='action_required'||deposit.refundIntent)throw new Error('This Bitcoin deposit is already being processed.');
  const owned=await spark.queryStaticDepositAddresses();guard();
  if(!owned.includes(deposit.address))throw new Error('Lightning deposit address could not be verified.');
  const gross=await depositAmount(appConfig.sparkNetwork,deposit.txid,deposit.vout,deposit.address);guard();
  const operation:OnchainOperation={version:1,id:'legacy:'+deposit.id,scope:onchain.scope,network:onchain.network,kind:'refund',state:'prepared',quote:null,
    amountSats:gross,feeSats:null,address:deposit.address,txid:deposit.txid,vout:deposit.vout,rawTransaction:null,
    createdAt:deposit.createdAt,updatedAt:new Date().toISOString(),sparkScope:scope,sparkOperationId:id,transferStage:'claim_required'};
  try{await journal.reserve(operation);}catch(cause){
    const winner=(await journal.list(onchain.scope)).find(row=>row.id===operation.id);guard();if(!winner)throw cause;
    return winner;
  }
  guard();return journal.update(onchain.scope,operation.id,{state:'confirmed'});
}
