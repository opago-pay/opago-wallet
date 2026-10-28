import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { OnchainJournal, OnchainOperation } from './types';
import { sats } from './policy';

let database: Promise<SQLiteDatabase> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
const schema = `
 PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS onchain_operations(
   scope TEXT NOT NULL,id TEXT NOT NULL,record_json TEXT NOT NULL,PRIMARY KEY(scope,id));
 CREATE TABLE IF NOT EXISTS onchain_reservations(
   scope TEXT NOT NULL,outpoint TEXT NOT NULL,operation_id TEXT NOT NULL,PRIMARY KEY(scope,outpoint));
`;
async function db() {
  if (!database) database = openDatabaseAsync('opago-onchain-journal-v1.db').then(async connection => {
    await connection.execAsync(schema); return connection;
  }).catch(cause => { database = null; throw cause; });
  return database;
}
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = queue.catch(() => undefined).then(work);
  queue = result.then(() => undefined, () => undefined);
  return result;
}
function validate(record: OnchainOperation) {
  if (record.version !== 1 || !record.id || !/^bitcoin_onchain:(mainnet|testnet|signet|regtest):[0-9a-f]{64}$/.test(record.scope) || !record.scope.startsWith('bitcoin_onchain:'+record.network+':') ||
      !['prepared','broadcast_pending','broadcast','confirmed','aborted'].includes(record.state) ||
      !['send','to_lightning','from_lightning','refund'].includes(record.kind) ||
      !Number.isFinite(Date.parse(record.createdAt)) ||
      record.quote && (record.quote.scope !== record.scope || record.quote.network !== record.network)) {
    throw new Error('Bitcoin operation storage is invalid.');
  }
  if(record.txid!==null&&!/^[0-9a-f]{64}$/.test(record.txid)||record.vout!==null&&(!Number.isSafeInteger(record.vout)||record.vout<0))throw new Error('Invalid Bitcoin transaction identity.');
  if(record.quote&&(record.quote.txid!==record.txid||record.quote.vout!==record.vout||record.quote.address!==record.address||record.quote.amountSats!==record.amountSats||record.quote.feeSats!==record.feeSats))throw new Error('Bitcoin operation details changed.');
  sats(record.amountSats);
  if (record.feeSats !== null) sats(record.feeSats);
  if (record.rawTransaction !== null && !/^(?:[0-9a-f]{2})+$/.test(record.rawTransaction)) throw new Error('Invalid saved Bitcoin transaction.');
}
export function onchainJournal(): OnchainJournal {
  const ownerGeneration = generation;
  const current = () => { if (ownerGeneration !== generation) throw new Error('Wallet changed.'); };
  return {
    list: scope => serial(async () => {
      current(); const rows = await (await db()).getAllAsync<{record_json:string}>(
        'SELECT record_json FROM onchain_operations WHERE scope=? ORDER BY id',scope);
      current(); return rows.map(row => { const record = JSON.parse(row.record_json) as OnchainOperation; validate(record); return record; });
    }),
    reserve: operation => serial(async () => {
      current(); validate(operation);
      if (operation.state !== 'prepared' || operation.rawTransaction) throw new Error('Invalid Bitcoin reservation.');
      await (await db()).withExclusiveTransactionAsync(async tx => {
        current();
        await tx.runAsync('INSERT INTO onchain_operations(scope,id,record_json) VALUES(?,?,?)',
          operation.scope,operation.id,JSON.stringify(operation));
        for (const input of operation.quote?.inputs ?? []) {
          await tx.runAsync('INSERT INTO onchain_reservations(scope,outpoint,operation_id) VALUES(?,?,?)',
            operation.scope,input,operation.id);
        }
      });
      current();
    }),
    update: (scope,id,patch,expected) => serial(async () => {
      current(); let updated!: OnchainOperation;
      await (await db()).withExclusiveTransactionAsync(async tx => {
        current();
        const row = await tx.getFirstAsync<{record_json:string}>('SELECT record_json FROM onchain_operations WHERE scope=? AND id=?',scope,id);
        if (!row) throw new Error('Bitcoin operation not found.');
        const previous = JSON.parse(row.record_json) as OnchainOperation; validate(previous);
        if (expected && Object.entries(expected).some(([key,value]) => previous[key as keyof OnchainOperation] !== value)) throw new Error('This transfer is already being processed.');
        if (patch.address !== undefined && patch.address !== previous.address || patch.amountSats !== undefined && patch.amountSats !== previous.amountSats ||
            previous.txid && patch.txid !== undefined && patch.txid !== previous.txid ||
            patch.id && patch.id !== id || patch.scope && patch.scope !== scope || patch.network && patch.network !== previous.network ||
            patch.quote !== undefined && JSON.stringify(patch.quote) !== JSON.stringify(previous.quote) ||
            ['kind','feeSats','createdAt','sparkScope','sparkOperationId','withdrawalQuote'].some(key => Object.hasOwn(patch,key) && JSON.stringify(patch[key as keyof OnchainOperation]) !== JSON.stringify(previous[key as keyof OnchainOperation])) ||
            previous.refund && patch.refund !== undefined && (JSON.stringify({...previous.refund,rawTransaction:null}) !== JSON.stringify({...patch.refund,rawTransaction:null}) || !!previous.refund.rawTransaction && patch.refund.rawTransaction !== previous.refund.rawTransaction) ||
            previous.rawTransaction && patch.rawTransaction !== undefined && patch.rawTransaction !== previous.rawTransaction ||
            patch.state === 'aborted' && previous.state !== 'prepared' && previous.kind !== 'from_lightning') throw new Error('Bitcoin operation cannot be changed.');
        const same = Object.entries(patch).every(([key,value]) => JSON.stringify(previous[key as keyof OnchainOperation]) === JSON.stringify(value));
        if (same) { updated = previous; return; }
        updated = { ...previous,...patch,id,scope,updatedAt:new Date().toISOString() }; validate(updated);
        await tx.runAsync('UPDATE onchain_operations SET record_json=? WHERE scope=? AND id=?',JSON.stringify(updated),scope,id);
        // Confirmed inputs stay reserved: a reorg must never make a previously signed
        // input available to another operation. They disappear from BDK's UTXO set.
        if (updated.state === 'aborted') await tx.runAsync('DELETE FROM onchain_reservations WHERE scope=? AND operation_id=?',scope,id);
      });
      current(); return updated;
    }),
  };
}
export function clearOnchainJournal(): Promise<void> {
  generation++;
  return serial(async () => {
    const connection = await db();
    await connection.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM onchain_reservations');
      await tx.runAsync('DELETE FROM onchain_operations');
    });
  });
}
