import type * as Bdk from 'bdk-rn';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { onchainProvider, onchainRequest } from './provider';
import { deriveOnchainAccount } from './keys';
import { assertQuote, QUOTE_LIFETIME_MS, reservedInputs, sats } from './policy';
import { onchainJournal, clearOnchainJournal } from './journal-native';
import type { OnchainBalance, OnchainOperation, OnchainQuote, OnchainWallet } from './types';

const cleanups = new Set<() => Promise<void>>();
const directory = () => {
  if (!FileSystem.documentDirectory) throw new Error('Bitcoin storage is unavailable.');
  return FileSystem.documentDirectory + 'bitcoin-onchain-v1/';
};
function destroy(value: unknown) {
  (value as { uniffiDestroy?: () => void } | null)?.uniffiDestroy?.();
}
export async function initializeOnchainWallet(seed: Uint8Array, assertCurrent: () => void, signal?: AbortSignal): Promise<OnchainWallet> {
  const policy = onchainProvider();
  const bdk = await import('bdk-rn'); assertCurrent();
  const network = { mainnet:bdk.Network.Bitcoin,testnet:bdk.Network.Testnet,signet:bdk.Network.Signet,regtest:bdk.Network.Regtest }[policy.network];
  const networkKind = policy.network === 'mainnet' ? bdk.NetworkKind.Main : bdk.NetworkKind.Test;
  const keys = deriveOnchainAccount(seed,policy.network);
  seed.fill(0);
  const scope = keys.scope;
  const journal = onchainJournal();
  const privateDescriptors: Bdk.DescriptorLike[] = [];
  let wallet: Bdk.WalletLike | null = null;
  let persister: Bdk.PersisterLike | null = null;
  const descriptors: Bdk.DescriptorLike[] = [];
  let disposed = false;
  let updatedAt = 0;
  let scanned = false;
  let syncTask: Promise<OnchainBalance> | null = null;
  let syncController: AbortController | null = null;
  let paymentQueue: Promise<unknown> = Promise.resolve();
  const check = () => { assertCurrent(); if (disposed || !wallet || !persister) throw new Error('Bitcoin wallet is locked.'); };
  const persist = () => { check(); wallet!.persist(persister!); };
  let cleanupTask: Promise<void> | null = null;
  const dispose = (): Promise<void> => {
    if (cleanupTask) return cleanupTask;
    cleanupTask = (async () => {
    disposed = true;
    syncController?.abort();
    // Key-bearing objects are released immediately, even while a read-only scan exits.
    privateDescriptors.splice(0).forEach(destroy);
    await Promise.allSettled([syncTask, paymentQueue]);
    destroy(wallet); wallet = null; destroy(persister); persister = null;
    descriptors.splice(0).forEach(destroy);
    signal?.removeEventListener('abort',abortStartup);
    cleanups.delete(dispose);
    })(); return cleanupTask;
  };
  const abortStartup=()=>{keys.signingExternal='';keys.signingInternal='';void dispose();};
  cleanups.add(dispose);
  signal?.addEventListener('abort',abortStartup,{once:true});
  try {
    if(signal?.aborted){abortStartup();throw new Error('Bitcoin wallet is locked.');}
    privateDescriptors.push(new bdk.Descriptor(keys.signingExternal,networkKind));
    privateDescriptors.push(new bdk.Descriptor(keys.signingInternal,networkKind));
    keys.signingExternal = ''; keys.signingInternal = '';
    descriptors.push(new bdk.Descriptor(keys.external,networkKind));
    descriptors.push(new bdk.Descriptor(keys.internal,networkKind));
    await FileSystem.makeDirectoryAsync(directory(),{intermediates:true}); assertCurrent();
    const path = directory() + scope.split(':').at(-1) + '.sqlite';
    const exists = (await FileSystem.getInfoAsync(path)).exists; assertCurrent();
    const sqlitePath = decodeURIComponent(path.replace(/^file:\/\//,''));
    persister = bdk.Persister.newSqlite(sqlitePath);
    if (exists) {
      try {
        wallet = bdk.Wallet.load(descriptors[0],descriptors[1],persister,100);
      } catch {
        // First startup can be interrupted after newSqlite creates the file but
        // before the wallet is persisted. Rebuild from the deterministic public
        // descriptors and let the initial full scan recover chain state.
        assertCurrent();
        destroy(persister); persister = null;
        await FileSystem.deleteAsync(path,{idempotent:true}); assertCurrent();
        persister = bdk.Persister.newSqlite(sqlitePath);
        wallet = new bdk.Wallet(descriptors[0],descriptors[1],network,persister,100);
      }
    } else {
      wallet = new bdk.Wallet(descriptors[0],descriptors[1],network,persister,100);
    }
    persist();

    const balance = async (): Promise<OnchainBalance> => {
      check();
      const operations = await journal.list(scope); check();
      const reserved = reservedInputs(operations);
      const value = wallet!.balance();
      let reservedSats = 0;
      for (const utxo of wallet!.listUnspent()) {
        if (utxo.chainPosition.tag === bdk.ChainPosition_Tags.Confirmed &&
            reserved.has(utxo.outpoint.txid.toString()+':'+utxo.outpoint.vout)) reservedSats += sats(utxo.txout.value.toSat());
      }
      const confirmedSats = sats(value.confirmed.toSat());
      return { totalSats:sats(value.total.toSat()),confirmedSats,
        availableSats:sats(Math.max(0,confirmedSats-reservedSats)),reservedSats:sats(reservedSats),
        pendingSats:sats(value.trustedPending.toSat()+value.untrustedPending.toSat()),updatedAt };
    };
    const serialize = <T>(work: () => Promise<T>): Promise<T> => {
      const result = paymentQueue.catch(() => undefined).then(() => { check(); return work(); });
      paymentQueue = result.then(() => undefined,() => undefined); return result;
    };
    const broadcast = async (operation: OnchainOperation, guard: () => void) => {
      check(); guard();
      const saved = (await journal.list(scope)).find(row => row.id === operation.id); check(); guard();
      if (!saved?.rawTransaction || saved.state === 'aborted' || !saved.txid) throw new Error('No signed Bitcoin transaction is available.');
      if (saved.state === 'confirmed') return saved;
      const signed = new bdk.Transaction(Uint8Array.from(hexToBytes(saved.rawTransaction)).buffer);
      try { if (signed.computeTxid().toString() !== saved.txid) throw new Error('Saved Bitcoin transaction changed.'); } finally { destroy(signed); }
      // Transport failure leaves broadcast_pending intact. Only this exact signed
      // transaction may be retried, never a newly constructed payment.
      const result = (await onchainRequest('/tx',{
        method:'POST',headers:{'Content-Type':'text/plain'},body:saved.rawTransaction,
      })).trim();
      check();
      if (result !== saved.txid) throw new Error('Bitcoin broadcast result could not be verified.');
      return journal.update(scope,saved.id,{state:'broadcast'});
    };
    const verifyQuote = (quote: OnchainQuote, psbt: Bdk.PsbtLike) => {
      assertQuote(quote,scope,policy.network); check();
      const transaction = psbt.extractTxUncheckedFeeRate();
      try {
        if (transaction.computeTxid().toString() !== quote.txid || sats(psbt.fee()) !== quote.feeSats || sats(wallet!.calculateFee(transaction).toSat()) !== quote.feeSats) throw new Error('Bitcoin payment changed.');
        const inputs = transaction.input().map(input => input.previousOutput.txid.toString()+':'+input.previousOutput.vout);
        if (JSON.stringify(inputs) !== JSON.stringify(quote.inputs)) throw new Error('Bitcoin payment inputs changed.');
        const outputs = transaction.output();
        const recipient = new bdk.Address(quote.address,network);
        try {
          const targetScript = bytesToHex(new Uint8Array(recipient.scriptPubkey().toBytes()));
          for (let index=0;index<outputs.length;index++) {
            const output=outputs[index];
            if (index === quote.vout) {
              if (bytesToHex(new Uint8Array(output.scriptPubkey.toBytes())) !== targetScript || sats(output.value.toSat()) !== quote.amountSats) throw new Error('Bitcoin recipient changed.');
            } else if (!wallet!.isMine(output.scriptPubkey)) throw new Error('Bitcoin change address is not owned by this wallet.');
          }
          if (!outputs[quote.vout]) throw new Error('Bitcoin recipient is missing.');
        } finally { destroy(recipient); }
      } finally { destroy(transaction); }
    };
    const result: OnchainWallet = {
      scope,network:policy.network,
      cleanupConnections:dispose,
      ownsAddress: address => {
        check(); const parsed=new bdk.Address(address,network);
        try { return wallet!.isMine(parsed.scriptPubkey()); } finally { destroy(parsed); }
      },
      receiveAddress: () => serialize(async () => {
        // Derivation is local. A slow/offline provider must not block receiving.
        // nextUnusedAddress reuses a persisted address until a scan observes use;
        // a restored wallet may therefore reuse an address, but cannot lose funds.
        check();
        const address=wallet!.nextUnusedAddress(bdk.KeychainKind.External);
        persist(); return address.address.toString();
      }),
      balance,
      sync: () => {
        check(); if (syncTask) return syncTask;
        syncController = new AbortController();
        const controller=syncController;
        const timer=setTimeout(() => controller.abort(),60_000);
        const client=new bdk.EsploraClient(policy.esploraUrl);
        // Full scans also run after restart: recovery never relies solely on local indices.
        syncTask=(async () => {
          const update=scanned ? await client.sync(wallet!.startSyncWithRevealedSpks().build(),4n,{signal:controller.signal}) :
            await client.fullScan(wallet!.startFullScan().build(),100n,4n,{signal:controller.signal});
          try { check(); wallet!.applyUpdate(update); persist(); updatedAt=Date.now(); scanned=true; }
          finally { destroy(update); }
          const operations=await journal.list(scope); check();
          for (const operation of operations) if (operation.kind!=='refund' && operation.txid && operation.state !== 'aborted') {
            const tx=wallet!.getTx(bdk.Txid.fromString(operation.txid));
            if (tx) await journal.update(scope,operation.id,{state:tx.chainPosition.tag===bdk.ChainPosition_Tags.Confirmed?'confirmed':'broadcast'});
            else if(operation.state==='confirmed') await journal.update(scope,operation.id,{state:'broadcast_pending'});
            check();
          }
          return balance();
        })().finally(() => { clearTimeout(timer); destroy(client); syncTask=null; syncController=null; });
        return syncTask;
      },
      transactions: async () => {
        check();
        return wallet!.transactions().map(item => {
          const tx=item.transaction; const amounts=wallet!.sentAndReceived(tx);
          let feeSats:number|null=null;
          try { feeSats=sats(wallet!.calculateFee(tx).toSat()); } catch { /* Incoming sender inputs need not be known. */ }
          return {txid:tx.computeTxid().toString(),receivedSats:sats(amounts.received.toSat()),sentSats:sats(amounts.sent.toSat()),
            feeSats,confirmed:item.chainPosition.tag===bdk.ChainPosition_Tags.Confirmed,observedAt:item.chainPosition.tag===bdk.ChainPosition_Tags.Confirmed?Number(item.chainPosition.inner.confirmationBlockTime.confirmationTime)*1000:Number(item.chainPosition.inner.timestamp??0n)*1000,
            outputs:tx.output().map((output,vout) => {
              let address:string|null=null;
              try { address=bdk.Address.fromScript(output.scriptPubkey,network).toString(); } catch { /* OP_RETURN */ }
              return {address,valueSats:sats(output.value.toSat()),owned:wallet!.isMine(output.scriptPubkey),vout};
            })};
        });
      },
      prepare: (address,amountSats,guard) => serialize(async () => {
        guard(); if (!sats(amountSats)) throw new Error('Enter a Bitcoin amount.');
        await result.sync(); check(); guard();
        const estimates=JSON.parse(await onchainRequest('/fee-estimates')) as Record<string,number>; check(); guard();
        const estimate=estimates['6'];
        if (!Number.isFinite(estimate) || estimate<=0 || estimate>10_000) throw new Error('Bitcoin fee estimate is unavailable.');
        const feeRate=Math.ceil(estimate);
        const reserved=reservedInputs(await journal.list(scope)); check(); guard();
        const target=new bdk.Address(address,network);
        const excluded=wallet!.listUnspent().filter(output=>reserved.has(output.outpoint.txid.toString()+':'+output.outpoint.vout)).map(output=>output.outpoint);
        const builder=new bdk.TxBuilder().addRecipient(target.scriptPubkey(),bdk.Amount.fromSat(BigInt(amountSats)))
          .excludeBelowConfirmations(1).unspendable(excluded).feeRate(bdk.FeeRate.fromSatPerVb(BigInt(feeRate)));
        const psbt=builder.finish(wallet!);
        try {
          persist();
          const tx=psbt.extractTxUncheckedFeeRate();
          try {
            const script=bytesToHex(new Uint8Array(target.scriptPubkey().toBytes()));
            const vout=tx.output().findIndex(output=>bytesToHex(new Uint8Array(output.scriptPubkey.toBytes()))===script && sats(output.value.toSat())===amountSats);
            const feeSats=sats(psbt.fee());
            const quote:OnchainQuote={version:1,scope,network:policy.network,address,amountSats,feeSats,totalSats:sats(amountSats+feeSats),feeRate,
              expiresAt:Date.now()+QUOTE_LIFETIME_MS,psbt:psbt.serialize(),txid:tx.computeTxid().toString(),vout,
              inputs:tx.input().map(input=>input.previousOutput.txid.toString()+':'+input.previousOutput.vout)};
            verifyQuote(quote,psbt); return Object.freeze({...quote,inputs:Object.freeze([...quote.inputs]) as unknown as string[]});
          } finally { destroy(tx); }
        } finally { destroy(psbt); destroy(builder); destroy(target); }
      }),
      send: (input,guard,kind='send',spark) => serialize(async () => {
        const quote=JSON.parse(JSON.stringify(input)) as OnchainQuote; guard(); assertQuote(quote,scope,policy.network);
        await result.sync(); check(); guard();
        const reserved=reservedInputs(await journal.list(scope)); check(); guard();
        for (const outpoint of quote.inputs) {
          if (reserved.has(outpoint)) throw new Error('Bitcoin inputs are already reserved.');
          const [txid,vout]=outpoint.split(':');
          const utxo=wallet!.getUtxo({txid:bdk.Txid.fromString(txid),vout:Number(vout)});
          if (!utxo || utxo.isSpent || utxo.chainPosition.tag!==bdk.ChainPosition_Tags.Confirmed) throw new Error('Bitcoin balance changed. Prepare the payment again.');
        }
        const psbt=new bdk.Psbt(quote.psbt);
        try {
          verifyQuote(quote,psbt);
          const now=new Date().toISOString();
          const operation:OnchainOperation={version:1,id:Crypto.randomUUID(),scope,network:policy.network,kind,state:'prepared',quote,
            address:quote.address,amountSats:quote.amountSats,feeSats:quote.feeSats,txid:quote.txid,vout:quote.vout,rawTransaction:null,createdAt:now,updatedAt:now,
            sparkScope:spark?.scope??null,sparkOperationId:spark?.operationId??null,transferStage:kind==='to_lightning'?'waiting_onchain':null};
          await journal.reserve(operation); check(); guard();
          const signers: Bdk.SignersContainerLike[]=[];
          try {
            for(const descriptor of privateDescriptors) signers.push(bdk.SignersContainer.fromDescriptor(descriptor));
            if (!wallet!.signWithSigners(psbt,signers,undefined)) throw new Error('Bitcoin transaction could not be signed.');
            guard(); check(); verifyQuote(quote,psbt);
            const signed=psbt.extractTx();
            let rawTransaction:string;
            try { rawTransaction=bytesToHex(new Uint8Array(signed.serialize())); } finally { destroy(signed); }
            const saved=await journal.update(scope,operation.id,{state:'broadcast_pending',rawTransaction}); check(); guard();
            return broadcast(saved,guard);
          } finally { signers.forEach(destroy); }
        } finally { destroy(psbt); }
      }),
      rebroadcast: (operation,guard) => serialize(()=>broadcast(operation,guard)),
    };
    return result;
  } catch (cause) { keys.signingExternal=''; keys.signingInternal=''; await dispose(); throw cause; }
}
export async function clearOnchainWalletData() {
  await Promise.all([...cleanups].map(cleanup=>cleanup()));
  await clearOnchainJournal();
  await FileSystem.deleteAsync(directory(),{idempotent:true});
}
