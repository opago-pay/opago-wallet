'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
require('./register-typescript.cjs');const media=require('../lib/opago/identity-media.ts');const fixtures=require('./fixtures/p3-photo.json');
function fixture(){const files=new Map([['file:///private/cache/ImagePicker/source.jpg',fixtures.source_jpeg]]);const removed=[];let permitted=true,canceled=false,normalized=false;
  const picker={UIImagePickerPreferredAssetRepresentationMode:{Compatible:'compatible'},requestCameraPermissionsAsync:async()=>({granted:permitted}),
    launchCameraAsync:async()=>({canceled,assets:canceled?null:[{uri:'file:///private/cache/ImagePicker/source.jpg',type:'image',width:600,height:800}]}),
    launchImageLibraryAsync:async()=>({canceled,assets:canceled?null:[{uri:'file:///private/cache/ImagePicker/source.jpg',type:'image',width:600,height:800}]})};
  const storage={cacheDirectory:'file:///private/cache/',EncodingType:{Base64:'base64'},getInfoAsync:async uri=>({exists:files.has(uri),isDirectory:false,size:Buffer.from(files.get(uri)||'','base64').length}),
    readAsStringAsync:async uri=>files.get(uri),writeAsStringAsync:async(uri,content)=>files.set(uri,content),makeDirectoryAsync:async()=>{},deleteAsync:async uri=>{removed.push(uri);files.delete(uri);}};
  const image={SaveFormat:{JPEG:'jpeg'},manipulateAsync:async(uri,actions,options)=>{assert.equal(uri,'file:///private/cache/ImagePicker/source.jpg');assert.deepEqual(actions,[]);assert.equal(options.compress,1);normalized=true;
    const uriOut='file:///private/cache/ImageManipulator/normalized.jpg';files.set(uriOut,fixtures.normalized_jpeg);return{uri:uriOut,width:800,height:600};}};
  const exports={};const deps={'expo-image-picker':picker,'expo-file-system/legacy':storage,'expo-image-manipulator':image,'expo-crypto':{randomUUID:()=> 'synthetic-image'},buffer:require('buffer'),'./identity-media':media};
  const source=fs.readFileSync(path.join(__dirname,'../lib/opago/identity-media-native.ts'),'utf8');new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(n=>deps[n],exports);
  return{api:exports,files,removed,picker,setPermission:v=>permitted=v,setCanceled:v=>canceled=v,get normalized(){return normalized;}};}
test('P3 native media port handles camera denial and selection cancellation without decoding or uploading',async()=>{
  const f=fixture();f.setPermission(false);await assert.rejects(f.api.selectIdentityPhoto('camera','front',()=>{}),/identity_camera_denied/);assert.equal(f.normalized,false);
  f.setCanceled(true);assert.equal(await f.api.selectIdentityPhoto('library','front',()=>{}),null);assert.equal(f.normalized,false);
});
test('P3 real media orchestration verifies bytes, normalizes orientation, strips metadata and removes owned temporary copies',async()=>{
  const f=fixture();const image=await f.api.selectIdentityPhoto('camera','front',()=>{});assert.equal(image.uri,'file:///private/cache/opago-p3/synthetic-image.jpg');
  assert.equal(media.inspectPhoto(image.bytes).width,800);assert.equal(Buffer.from(image.bytes).includes(Buffer.from('Exif')),false);
  assert.equal(f.removed.includes('file:///private/cache/ImagePicker/source.jpg'),true);assert.equal(f.removed.includes('file:///private/cache/ImageManipulator/normalized.jpg'),true);
  await f.api.removeIdentityPhoto(image);assert.equal(image.bytes.every(b=>b===0),true);assert.equal(f.files.has(image.uri),false);
  await f.api.cleanupIdentityPhotos();assert.ok(f.removed.every(uri=>uri.startsWith('file:///private/cache/')));
});
test('P3 native media rejects disguised/oversized inputs before decode and cleans a late result after lock',async()=>{
  const f=fixture();f.files.set('file:///private/cache/ImagePicker/source.jpg',Buffer.from('not an image').toString('base64'));
  await assert.rejects(f.api.selectIdentityPhoto('library','front',()=>{}));assert.equal(f.normalized,false);assert.ok(f.removed.length);
  const late=fixture();await assert.rejects(late.api.selectIdentityPhoto('camera','front',()=>{if(late.normalized)throw new Error('wallet changed');}));
  assert.equal([...late.files.keys()].some(k=>k.includes('ImageManipulator')),false);assert.equal([...late.files.keys()].some(k=>k.includes('opago-p3')),false);
});
