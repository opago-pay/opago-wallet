// Independent Node verification of the fixed fixture subset, NOT a runtime codec.
const fs = require('node:fs');
const path = require('node:path');
const c = require('node:crypto');
const { schnorr } = require('@noble/curves/secp256k1');
const root = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const hex = (s) => Buffer.from(s, 'hex');
const b64 = (s) => Buffer.from(s, 'base64url');
const sha = (b) => c.createHash('sha256').update(b).digest();
// Fixture objects use ASCII member names and only JCS-compatible safe values.
const ordered = (v) => Array.isArray(v) ? v.map(ordered) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordered(v[k])])) : v;
const bytes = (v) => Buffer.from(JSON.stringify(ordered(v)), 'utf8');
let count = 0;
const equal = (a,b,label) => { if (!Buffer.from(a).equals(Buffer.from(b))) throw Error(label); count++; };
const expect = (v,label) => { if (!v) throw Error(label); count++; };
const extract = (salt, ikm) => c.createHmac('sha256', salt.length ? salt : Buffer.alloc(32)).update(ikm).digest();
const expand = (prk, info, n) => { let t=Buffer.alloc(0), out=Buffer.alloc(0); for(let i=1;out.length<n;i++){t=c.createHmac('sha256',prk).update(Buffer.concat([t,info,Buffer.from([i])])).digest();out=Buffer.concat([out,t]);} return out.subarray(0,n); };
const lx = (suite,salt,label,ikm) => extract(salt,Buffer.concat([Buffer.from('HPKE-v1'),suite,Buffer.from(label),ikm]));
const le = (suite,prk,label,info,n) => { const len=Buffer.alloc(2);len.writeUInt16BE(n);return expand(prk,Buffer.concat([len,Buffer.from('HPKE-v1'),suite,Buffer.from(label),info]),n); };
const decrypt = (key,nonce,ct,aad) => { const d=c.createDecipheriv('aes-256-gcm',key,nonce);d.setAAD(aad);d.setAuthTag(ct.subarray(-16));return Buffer.concat([d.update(ct.subarray(0,-16)),d.final()]); };
for (const v of read('fixtures/wallet-auth-vectors.json').vectors) {
  equal(Buffer.from(v.message),hex(v.message_hex),'UTF-8 message');
  equal(sha(Buffer.from(v.message)),hex(v.msg32_hex),'Message hash');
  expect(schnorr.verify(hex(v.signature_hex),hex(v.msg32_hex),hex(v.xonly_public_key_hex)),'Schnorr signature');
  expect(!schnorr.verify(hex(v.signature_hex),sha(Buffer.from(v.message+'\n')),hex(v.xonly_public_key_hex)),'Schnorr newline mutation');
}
for (const v of read('fixtures/hpke-vectors.json').vectors) {
  const enc=b64(v.envelope.enc), pkr=hex(v.receiver_public_key_hex);
  const sk=c.createPrivateKey({key:Buffer.concat([hex('302e020100300506032b656e04220420'),hex(v.test_receiver_private_key_hex)]),format:'der',type:'pkcs8'});
  const pk=c.createPublicKey({key:Buffer.concat([hex('302a300506032b656e032100'),enc]),format:'der',type:'spki'});
  const dh=c.diffieHellman({privateKey:sk,publicKey:pk});
  const kem=Buffer.concat([Buffer.from('KEM'),hex('0020')]),suite=Buffer.concat([Buffer.from('HPKE'),hex('002000010002')]),empty=Buffer.alloc(0);
  const shared=le(kem,lx(kem,empty,'eae_prk',dh),'shared_secret',Buffer.concat([enc,pkr]),32);
  const ctx=Buffer.concat([Buffer.from([0]),lx(suite,empty,'psk_id_hash',empty),lx(suite,empty,'info_hash',hex(v.info_hex))]);
  const secret=lx(suite,shared,'secret',empty),key=le(suite,secret,'key',ctx,32),nonce=le(suite,secret,'base_nonce',ctx,12),exp=le(suite,secret,'exp',ctx,32);
  const exportKey=(label)=>le(suite,exp,'sec',Buffer.from(label),32);
  equal(bytes(v.aad),hex(v.aad_hex),'JS/Python canonical AAD');
  equal(decrypt(key,nonce,b64(v.envelope.ciphertext),bytes(v.aad)),bytes(v.plaintext),'JS HPKE request');
  equal(exportKey('opago-response'),hex(v.response_export_key_hex),'JS exporter');
  equal(decrypt(exportKey('opago-response'),b64(v.response.nonce),b64(v.response.ciphertext),bytes({request_aad:v.aad,http_status:v.response_status})),bytes(v.response_plaintext),'JS response');
  if(v.photo_body_hex){const body=hex(v.photo_body_hex);equal(decrypt(exportKey('opago-photo'),body.subarray(0,12),body.subarray(12),bytes({request_aad:v.aad,document:v.plaintext})),hex(v.photo_plaintext_hex),'JS photo');}
}
const kd=read('fixtures/hpke-key-document-vectors.json');
const ed=c.createPublicKey({key:Buffer.concat([hex('302a300506032b6570032100'),hex(kd.root_public_key_hex)]),format:'der',type:'spki'});
equal(bytes(kd.response.document),hex(kd.signed_bytes_hex),'Ed25519 JCS');
expect(c.verify(null,bytes(kd.response.document),ed,b64(kd.response.signature)),'Ed25519 signature');
const lp=(s)=>{const b=Buffer.from(s);const len=Buffer.alloc(4);len.writeUInt32BE(b.length);return Buffer.concat([len,b]);};
const observations=read('fixtures/observation-vectors.json');
for(const v of observations.vectors){
  const o=v.observation, ignore=new Set(['event_id','observation_family_id','event_version','seq','supersedes_event_id','correction_reason']);
  const payload=Object.fromEntries(Object.entries(o).filter(([k])=>!ignore.has(k)));
  const family=Buffer.concat(['opago-observation-family-v1',observations.network,observations.wallet_pubkey,'payment_hash',o.payment_hash,o.type,o.direction,o.status].map(lp));
  equal(sha(family),hex(o.observation_family_id),'JS family');
  equal(sha(bytes(payload)),hex(o.event_version),'JS version');
  equal(sha(Buffer.concat(['opago-observation-v1',o.observation_family_id,o.event_version].map(lp))),hex(o.event_id),'JS event');
}
const report=read('validation-report.json');
if(report.result!=='passed')throw Error('Run Python contract validation first');
report.javascript_verification={result:'passed',checks:count,node:process.version,scope:'Node reference fixtures; not Android/iOS runtime or Spark SDK'};
fs.writeFileSync(path.join(root,'validation-report.json'),JSON.stringify(report,null,2)+'\n');
process.stdout.write(`Independent JavaScript checks passed: ${count}\n`);
