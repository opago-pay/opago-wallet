import { Transaction, OutScript } from '@scure/btc-signer';
import { Address } from '@scure/btc-signer/payment';
import { hex } from '@scure/base';
import { sha256 } from '@noble/hashes/sha256';
import type { BitcoinNetwork } from '../bitcoin/destination';
import { bitcoinNetwork } from '../bitcoin/destination';
import { sats } from './policy';
export interface RefundPlan {
  depositTxid:string;vout:number;address:string;grossSats:number;feeSats:number;amountSats:number;txid:string;expiresAt:number;rawTransaction:string|null;
}
export function prepareRefundTransaction(depositTxid:string,vout:number,address:string,grossSats:number,feeSats:number,network:BitcoinNetwork,now=Date.now()):RefundPlan{
  if(!/^[0-9a-f]{64}$/.test(depositTxid)||!Number.isSafeInteger(vout)||vout<0)throw new Error('Invalid Bitcoin deposit.');
  const amountSats=sats(sats(grossSats)-sats(feeSats));
  if(feeSats<194||amountSats<546)throw new Error('Bitcoin deposit is too small for the refund fee.');
  const tx=new Transaction({version:3});
  tx.addInput({txid:depositTxid,index:vout,witnessScript:new Uint8Array()});
  tx.addOutput({script:OutScript.encode(Address(bitcoinNetwork(network)).decode(address)),amount:BigInt(amountSats)});
  return {depositTxid,vout,address,grossSats,feeSats,amountSats,txid:hex.encode(sha256(sha256(tx.unsignedTx)).reverse()),expiresAt:now+120_000,rawTransaction:null};
}
export function verifyRefundTransaction(raw:string,plan:RefundPlan,network:BitcoinNetwork){
  if(!/^(?:[0-9a-f]{2})+$/.test(raw)||raw.length>100_000)throw new Error('Invalid Bitcoin refund transaction.');
  const tx=Transaction.fromRaw(hex.decode(raw));
  if(tx.id!==plan.txid||tx.inputsLength!==1||tx.outputsLength!==1||
     tx.getOutputAddress(0,bitcoinNetwork(network))!==plan.address||sats(tx.getOutput(0).amount ?? -1)!==plan.amountSats||
     !tx.getInput(0).finalScriptWitness?.length)throw new Error('Bitcoin refund does not match the approved transfer.');
  return tx.id;
}
