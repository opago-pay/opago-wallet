import type { PaymentHistoryItem } from '../payment-details';
import type { OnchainOperation, OnchainTransaction } from './types';

export function mergeOnchainHistory(existing:PaymentHistoryItem[],transactions:OnchainTransaction[],operations:OnchainOperation[],locale:string):PaymentHistoryItem[]{
  const active=operations.filter(row=>row.state!=='aborted');
  const linked=new Set(active.flatMap(row=>[row.txid,row.refund?.txid,row.sparkOperationId,row.sparkTransferId?'spark:'+row.sparkTransferId:null].filter(Boolean)));
  const rows=existing.filter(row=>!linked.has(row.key)&&!linked.has(row.operation?.id)&&!linked.has(row.txId));
  for(const operation of active)rows.push({
    key:'own:'+operation.id,txId:operation.txid,type:'outgoing',amountValue:operation.amountSats,amountDisplay:operation.amountSats.toLocaleString(locale),asset:'SAT',
    status:operation.transferStage==='completed'||operation.transferStage==='refunded'?'confirmed':operation.transferStage==='claim_required'?'action_required':operation.state==='confirmed'&&!operation.transferStage?'confirmed':'pending',
    timestamp:operation.createdAt,route:'onchain',account:'bitcoin_onchain',onchainOperationId:operation.id,
    legacyDeposit:operation.kind==='refund',
    internalTransfer:operation.kind!=='refund'&&operation.transferStage?operation.kind==='from_lightning'?'from_lightning':'to_lightning':undefined,
  });
  for(const tx of transactions){
    if(linked.has(tx.txid))continue;
    const amount=tx.sentSats>0?Math.max(0,tx.sentSats-tx.receivedSats-(tx.feeSats??0)):tx.receivedSats;
    rows.push({key:'own-tx:'+tx.txid,txId:tx.txid,type:tx.sentSats>0?'outgoing':'incoming',amountDisplay:tx.sentSats>0&&tx.feeSats===null?'—':amount.toLocaleString(locale),amountValue:tx.sentSats>0&&tx.feeSats===null?undefined:amount,
      asset:'SAT',status:tx.confirmed?'confirmed':'pending',timestamp:tx.observedAt>0?new Date(tx.observedAt).toISOString():'',rateTimeUnknown:tx.observedAt<=0,route:'onchain',account:'bitcoin_onchain'});
  }
  return rows.sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||a.key.localeCompare(b.key));
}
