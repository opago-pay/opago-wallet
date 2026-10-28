import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { PrivateStore } from '../opago/store';
import { jcs,utf8 } from '../opago/encoding';
import { sats } from './policy';
import type { OnchainOperation,OnchainTransaction,OnchainNetwork } from './types';

export type OnchainSyncOwner={scope:string;subject:string;installationId:string;generation:number};
export type OnchainEvent={
  version:1;eventKey:string;network:OnchainNetwork;account:'bitcoin_onchain';
  kind:'payment'|'internal_transfer'|'legacy_deposit';direction:'incoming'|'outgoing'|'to_lightning'|'from_lightning';
  amountSats:string;networkFeeSats:string|null;serviceFeeSats:string|null;totalFeeSats:string|null;claimFeeSats:string|null;
  status:'prepared'|'canceled'|'pending'|'confirmed'|'claim_required'|'claim_checking'|'completed'|'refund_checking'|'refunded';
  txid:string|null;vout:number|null;sparkOperationId:string|null;sparkTransferId:string|null;
  refundTxid:string|null;refundFeeSats:string|null;
};
export function onchainEvents(network:OnchainNetwork,transactions:OnchainTransaction[],operations:OnchainOperation[]):OnchainEvent[]{
  const moves=operations.filter(item=>item.transferStage);
  const sends=operations.filter(item=>item.kind==='send');
  const linked=new Set([...moves,...sends].flatMap(item=>[item.txid,item.refund?.txid].filter(Boolean)));
  const amount=(value:number|null|undefined)=>value===null||value===undefined?null:String(sats(value));
  const result:OnchainEvent[]=moves.map(item=>({
    version:1,eventKey:'move:'+network+':'+item.sparkOperationId,network,account:'bitcoin_onchain',kind:item.kind==='refund'?'legacy_deposit':'internal_transfer',
    direction:item.kind==='refund'?'incoming':item.kind==='from_lightning'?'from_lightning':'to_lightning',amountSats:String(sats(item.amountSats)),
    networkFeeSats:amount(item.kind==='from_lightning'?item.withdrawalQuote?.networkFeeSats:item.feeSats),serviceFeeSats:amount(item.withdrawalQuote?.serviceFeeSats),totalFeeSats:amount(item.actualFeeSats??item.feeSats),claimFeeSats:amount(item.claimFeeSats),
    status:item.state==='aborted'?'canceled':item.state==='prepared'?'prepared':item.transferStage==='waiting_onchain'?'pending':item.transferStage!,
    txid:item.txid,vout:item.vout,sparkOperationId:item.sparkOperationId,sparkTransferId:item.sparkTransferId??null,
    refundTxid:item.refund?.txid??null,refundFeeSats:amount(item.refund?.feeSats),
  }));
  for(const send of sends){
    if(!send.txid)continue;
    const chain=transactions.find(tx=>tx.txid===send.txid);
    result.push({version:1,eventKey:'tx:'+network+':'+send.txid,network,account:'bitcoin_onchain',kind:'payment',direction:'outgoing',
      amountSats:String(sats(send.amountSats)),networkFeeSats:amount(chain?.feeSats??send.feeSats),serviceFeeSats:null,totalFeeSats:amount(chain?.feeSats??send.feeSats),claimFeeSats:null,
      status:send.state==='aborted'?'canceled':send.state==='prepared'?'prepared':chain?.confirmed?'confirmed':'pending',
      txid:send.txid,vout:send.vout,sparkOperationId:null,sparkTransferId:null,refundTxid:null,refundFeeSats:null});
  }
  for(const tx of transactions){
    if(linked.has(tx.txid))continue;
    if(!/^[0-9a-f]{64}$/.test(tx.txid))throw new Error('Invalid Bitcoin transaction identity.');
    const outgoing=tx.sentSats>0;
    if(outgoing&&tx.feeSats===null)continue; // Do not invent a recipient amount from a net balance delta.
    const value=outgoing?Math.max(0,tx.sentSats-tx.receivedSats-(tx.feeSats??0)):tx.receivedSats;
    result.push({version:1,eventKey:'tx:'+network+':'+tx.txid,network,account:'bitcoin_onchain',kind:'payment',
      direction:outgoing?'outgoing':'incoming',amountSats:String(sats(value)),networkFeeSats:outgoing?amount(tx.feeSats):null,
      serviceFeeSats:null,totalFeeSats:outgoing?amount(tx.feeSats):null,claimFeeSats:null,status:tx.confirmed?'confirmed':'pending',txid:tx.txid,vout:null,sparkOperationId:null,sparkTransferId:null,
      refundTxid:null,refundFeeSats:null});
  }
  return result;
}
export interface OnchainAccountPort{
  readonly contract:'opago-onchain-v1';
  report(owner:OnchainSyncOwner,event:OnchainEvent,idempotencyKey:string):Promise<{
    eventKey:string;subject:string;scope:string;idempotencyKey:string;receiptId:string;
  }>;
}
type Entry={id:string;digest:string;event:OnchainEvent};
type Document={version:1;owner:OnchainSyncOwner;entries:Entry[];seen:Record<string,string>;receipts:Record<string,string>};
const digest=(value:unknown)=>bytesToHex(sha256(utf8(jcs(value))));
const queues=new WeakMap<PrivateStore,Map<string,Promise<unknown>>>();
/** This is a durable outbox for the proposed contract. A missing backend port
 * never acknowledges a report. It must not be adapted to Spark's payment rail. */
export class OnchainAccountSync{
  readonly key:string;
  constructor(readonly store:PrivateStore,readonly owner:OnchainSyncOwner,readonly port:OnchainAccountPort|null,
    readonly uuid:()=>string,readonly guard:()=>void){
    if(!owner.scope.startsWith('bitcoin_onchain:')||!owner.subject||!owner.installationId||!Number.isSafeInteger(owner.generation)||owner.generation<0)throw new Error('sync_owner_changed');
    this.owner=Object.freeze({...owner});this.key='onchain.outbox.v1.'+digest(owner);
  }
  private serial<T>(work:()=>Promise<T>):Promise<T>{
    let queue=queues.get(this.store);if(!queue){queue=new Map();queues.set(this.store,queue);}
    const promise=(queue.get(this.key)||Promise.resolve()).catch(()=>undefined).then(()=>{this.guard();return work();});
    queue.set(this.key,promise);return promise;
  }
  private async load():Promise<Document>{
    this.guard();const value=await this.store.read<Document>(this.key);this.guard();
    if(!value)return {version:1,owner:this.owner,entries:[],seen:{},receipts:{}};
    if(value.version!==1||jcs(value.owner)!==jcs(this.owner)||!Array.isArray(value.entries)||!value.seen||!value.receipts)throw new Error('sync_invalid_storage');
    return value;
  }
  private async save(value:Document){this.guard();if(utf8(jcs(value)).length>1_500_000)throw new Error('sync_storage_full');await this.store.write(this.key,value);this.guard();}
  collect(events:OnchainEvent[]){return this.serial(async()=>{
    const doc=await this.load();
    for(const event of events){
      if(event.account!=='bitcoin_onchain'||!this.owner.scope.startsWith('bitcoin_onchain:'+event.network+':'))throw new Error('sync_owner_changed');
      const hash=digest(event);if(doc.seen[event.eventKey]===hash)continue;
      if(doc.entries.length>=500)break; // Persist a bounded prefix; after delivery, collect the remainder.
      doc.entries.push({id:this.uuid(),digest:hash,event:JSON.parse(JSON.stringify(event))});doc.seen[event.eventKey]=hash;
    }
    await this.save(doc);
  });}
  flush(){return this.serial(async()=>{
    const doc=await this.load();if(!this.port)throw new Error('onchain_sync_backend_pending');
    if(this.port.contract!=='opago-onchain-v1')throw new Error('sync_invalid_contract');
    for(const entry of doc.entries.slice(0,10)){
      this.guard();const receipt=await this.port.report(this.owner,entry.event,entry.id);this.guard();
      if(receipt.eventKey!==entry.event.eventKey||receipt.subject!==this.owner.subject||receipt.scope!==this.owner.scope||
        receipt.idempotencyKey!==entry.id||!receipt.receiptId)throw new Error('sync_invalid_receipt');
      doc.receipts[entry.event.eventKey]=receipt.receiptId;doc.entries=doc.entries.filter(item=>item.id!==entry.id);
      await this.save(doc);
    }
  });}
  status(){return this.serial(async()=>{const doc=await this.load();return {queued:doc.entries.length,acknowledged:Object.keys(doc.receipts).length,backendAvailable:!!this.port};});}
}
