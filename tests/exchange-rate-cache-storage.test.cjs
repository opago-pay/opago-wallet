'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(storage) {
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/exchange-rates-cache-native.ts'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText;
  const exports={};
  new Function('require','exports',code)(name=>{
    assert.equal(name,'@react-native-async-storage/async-storage');return storage;
  },exports);
  return exports.exchangeRateCacheStorage;
}

test('a slow earlier disk write cannot overwrite the most recent price snapshot',async()=>{
  const writes=[];const finish=[];let raw=null;
  const store=fixture({getItem:async()=>raw,setItem:(_key,value)=>new Promise(resolve=>{
    writes.push(value);finish.push(()=>{raw=value;resolve();});
  })});
  const first=store.write('older');const second=store.write('newer');
  await flush();assert.deepEqual(writes,['older']);
  finish[0]();await flush();assert.deepEqual(writes,['older','newer']);
  finish[1]();await Promise.all([first,second]);assert.equal(await store.read(),'newer');
});

test('a failed disk write does not block saving the next successful quote',async()=>{
  let raw=null;
  const store=fixture({getItem:async()=>raw,setItem:async(_key,value)=>{
    if(value==='failed')throw Error('Storage temporarily unavailable');raw=value;
  }});
  const failed=assert.rejects(store.write('failed'),/Storage temporarily unavailable/);
  await store.write('recovered');await failed;assert.equal(await store.read(),'recovered');
});
