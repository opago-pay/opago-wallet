"""Synthetic contract fixtures only. Test keys MUST NOT enter application code."""
from pathlib import Path
import base64
import copy
import hashlib
import json
import sys
import struct
import zlib

if len(sys.argv) > 1:
    sys.path.insert(0, str(Path(sys.argv[1]).resolve()))
import rfc8785
from pyhpke import CipherSuite, KEMId, KDFId, AEADId
from coincurve import PrivateKey
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT = Path(__file__).resolve().parents[1]
F = ROOT / 'fixtures'
F.mkdir(exist_ok=True)

def b64(data): return base64.urlsafe_b64encode(data).rstrip(b'=').decode()
def sha(data): return hashlib.sha256(data).hexdigest()
def uid(n): return f'00000000-0000-4000-8000-{n:012d}'
def write(name,data): (F/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def jcs(value): return rfc8785.dumps(value)

TIME='2026-09-28T12:00:00Z'
SK=(3).to_bytes(32,'big')
PK=PrivateKey(SK).public_key.format(compressed=True).hex()

auth=[]
for action, params in [('login',{}),('wallet_bind',{'party_id':uid(1),'account_generation':1}),('wallet_restore',{'wallet_id':uid(2),'party_id':uid(1),'account_generation':2}),('payer_proof',{'context_ref':b64(bytes(range(32))),'amount_msat':2100000})]:
    message='\n'.join(['opago-wallet-auth','domain: api.opago.com','network: mainnet','wallet_pubkey: '+PK,'nonce: '+'01'*32,'issued_at: '+TIME,'expires_at: 2026-09-28T12:05:00Z','action: '+action,'action_params_sha256: '+sha(jcs(params))])
    msg=bytes.fromhex(sha(message.encode()))
    auth.append({'action':action,'action_params':params,'test_private_key_hex':SK.hex(),'compressed_public_key_hex':PK,'xonly_public_key_hex':PK[2:],'message':message,'message_hex':message.encode().hex(),'msg32_hex':msg.hex(),'signature_hex':PrivateKey(SK).sign_schnorr(msg,aux_randomness=bytes(32)).hex()})
write('wallet-auth-vectors.json',{'warning':'PUBLIC SYNTHETIC TEST KEY ONLY','spark_sdk_0_7_12_execution':'NOT_EXECUTED','vectors':auth})

suite=CipherSuite.new(KEMId.DHKEM_X25519_HKDF_SHA256,KDFId.HKDF_SHA256,AEADId.AES256_GCM)
receiver=suite.kem.derive_key_pair(bytes(range(32)))
ephemeral=suite.kem.derive_key_pair(bytes(range(32,64)))
vectors=[]
error={'error':{'code':'upstream_pending','message':'Invoice outcome is being reconciled.','retryable':True,'details':{}},'request_id':uid(90)}
def png_chunk(kind,data):
    return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
photo=b'\x89PNG\r\n\x1a\n'+png_chunk(b'IHDR',struct.pack('>IIBBBBB',480,480,8,2,0,0,0))+png_chunk(b'IDAT',zlib.compress((b'\0'+b'\x80\x80\x80'*480)*480))+png_chunk(b'IEND',b'')
descriptor={'submission_id':uid(7),'revision':2,'side':'front','content_type':'image/png','plaintext_length':len(photo),'original_sha256':sha(photo),'expected_edit_version':1}
for i,(name,method,path,query,plaintext,status,result) in enumerate([
 ('json','POST','/api/v2/wallet/auth/logout',[],{'refresh_token':'synthetic-refresh','installation_id':uid(3)},200,{'status':'ok'}),
 ('get','GET','/api/v2/wallet/address/availability',[['name','john.doe']],{},200,{'name':'john.doe','available':True,'reason':None}),
 ('error','POST','/api/v2/payments/registrations/'+uid(2)+'/invoice',[],{},503,error),
 ('photo','POST','/api/v2/onboarding/kyc/'+uid(7)+'/documents',[['revision','2'],['side','front']],descriptor,201,{'document_id':uid(8),'submission_id':uid(7),'revision':2,'side':'front','original_sha256':sha(photo),'stored_sha256':'ab'*32,'edit_version':2})
]):
    kid='test-hpke-20260928';audience='https://api.test.invalid'
    nonce=b64(bytes([i+1])*16)
    aad={'method':method,'path':path,'query':query,'kid':kid,'nonce':nonce,'issued_at':TIME,'audience':audience,'idempotency_key':None if method=='GET' else uid(100+i)}
    info=b'opago-api:hpke:v1\0'+audience.encode()+b'\0'+kid.encode()
    enc,ctx=suite.create_sender_context(receiver.public_key,info=info,eks=ephemeral)
    ciphertext=ctx.seal(jcs(plaintext),jcs(aad))
    env={'encryption':'hpke-v1','kid':kid,'enc':b64(enc),'nonce':nonce,'issued_at':TIME,'ciphertext':b64(ciphertext)}
    response_key=ctx.export(b'opago-response',32);rn=bytes([64+i])*12
    response_aad={'request_aad':aad,'http_status':status}
    response_ciphertext=AESGCM(response_key).encrypt(rn,jcs(result),jcs(response_aad))
    v={'name':name,'test_receiver_private_key_hex':receiver.private_key.to_private_bytes().hex(),'receiver_public_key_hex':receiver.public_key.to_public_bytes().hex(),'info_hex':info.hex(),'aad':aad,'aad_hex':jcs(aad).hex(),'plaintext':plaintext,'plaintext_hex':jcs(plaintext).hex(),'envelope':env,'envelope_header':b64(jcs(env)),'response_status':status,'response_plaintext':result,'response_aad_hex':jcs(response_aad).hex(),'response_export_key_hex':response_key.hex(),'response':{'encryption':'hpke-v1','nonce':b64(rn),'ciphertext':b64(response_ciphertext)}}
    if name=='photo':
        pk=ctx.export(b'opago-photo',32);pn=bytes([99])*12;pa={'request_aad':aad,'document':descriptor}
        v.update({'photo_transport_only':True,'image_description':'Synthetic 480x480 gray PNG, no person/document data. Successful decoding is not a successful identity comparison.','expected_photo_match':'unreadable','photo_plaintext_hex':photo.hex(),'photo_export_key_hex':pk.hex(),'photo_aad_hex':jcs(pa).hex(),'photo_body_hex':(pn+AESGCM(pk).encrypt(pn,photo,jcs(pa))).hex()})
    vectors.append(v)
write('hpke-vectors.json',{'warning':'PUBLIC TEST KEYS AND DETERMINISTIC NONCES; NEVER REUSE IN PRODUCTION','vectors':vectors})

root=Ed25519PrivateKey.from_private_bytes(bytes([7])*32)
document={'audience':'https://api.test.invalid','issued_at':TIME,'active_kid':'test-hpke-20260928','keys':[{'kid':'test-hpke-20260928','public_key':b64(receiver.public_key.to_public_bytes()),'not_after':'2026-10-28T12:00:00Z'}]}
write('hpke-key-document-vectors.json',{'warning':'PUBLIC TEST ROOT ONLY','test_root_private_key_hex':(bytes([7])*32).hex(),'root_public_key_hex':root.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw).hex(),'signed_bytes_hex':jcs(document).hex(),'response':{'document':document,'signing_key_id':'test-root','signature':b64(root.sign(jcs(document)))},'policy':{'now':TIME,'expected_audience':'https://api.test.invalid','last_issued_at':TIME,'revoked_kids':[],'revoked_signing_key_ids':[]}})

obs={'event_id':'00'*32,'observation_family_id':'00'*32,'event_version':'00'*32,'supersedes_event_id':None,'correction_reason':None,'seq':1,'type':'lightning','direction':'incoming','status':'settled','amount_msat':2100000,'fee_msat':0,'asset':'BTC','payment_hash':'ab'*32,'spark_transfer_id':None,'provider_event_id':None,'bolt11':None,'counterparty':{},'description':'Synthetic invoice','created_at':TIME,'signed_at':None,'settled_at':TIME}
def lp(value):
    raw=value.encode();return len(raw).to_bytes(4,'big')+raw
def stamp(item):
    family=b''.join(lp(x) for x in ['opago-observation-family-v1','mainnet',PK,'payment_hash',item['payment_hash'],item['type'],item['direction'],item['status']])
    ignored={'event_id','observation_family_id','event_version','seq','supersedes_event_id','correction_reason'}
    item['observation_family_id']=sha(family)
    payload={k:v for k,v in item.items() if k not in ignored}
    item['event_version']=sha(jcs(payload))
    eid=b''.join(lp(x) for x in ['opago-observation-v1',item['observation_family_id'],item['event_version']])
    item['event_id']=sha(eid)
    return {'observation':item,'family_bytes_hex':family.hex(),'version_bytes_hex':jcs(payload).hex(),'event_bytes_hex':eid.hex()}
first=stamp(obs)
second=copy.deepcopy(obs);second['seq']=17
third=copy.deepcopy(obs);third.update(fee_msat=1000,seq=2,supersedes_event_id=obs['event_id'],correction_reason='Provider fee arrived later')
events=[first,stamp(second),stamp(third)]
write('observation-vectors.json',{'network':'mainnet','wallet_pubkey':PK,'vectors':events})

fields={'given_name':'John','family_name':'Doe','date_of_birth':'1990-01-01','document_number':'TEST000001','document_expiry':'2030-01-01','nationality':'DEU','contact_email':'john@example.invalid','document_type':'passport'}
valid=[
 ('CreatePhotoMatch',{'submission_id':uid(7),'fields':fields}),
 ('UpdatePhotoMatch',{'revision':1,'expected_edit_version':1,'fields':fields}),
 ('NewRevision',{'base_revision':1,'expected_edit_version':3}),
 ('SubmitPhotoMatch',{'revision':2,'expected_edit_version':4}),
 ('PhotoDescriptor',descriptor),('PhotoUploadResult',vectors[3]['response_plaintext']),
 ('ChallengeRequest',{'wallet_pubkey':PK,'network':'mainnet','action':'wallet_bind','action_params':{'party_id':uid(1),'account_generation':1},'installation_id':uid(3)}),
 ('WalletBindingRequest',{'wallet_pubkey':PK,'network':'mainnet','installation_id':uid(3),'party_id':uid(1),'account_generation':1,'proof_token':'synthetic-proof'}),
 ('IngestRequest',{'installation_id':uid(3),'items':[obs]}),
 ('CreateRegistration',{'wallet_id':uid(2),'amount_msat':2100000,'description':'Synthetic payment'}),
 ('CreateRegistration',{'wallet_id':uid(2),'amount_msat':100000000000,'description':'No non-custodial EUR gate in schema; operational limits still apply'}),
 ('HelperInvoiceRequest',{'operation_id':uid(10),'registration_id':uid(11),'attempt_seq':1,'operation_generation':1,'receiver_identity_pubkey':PK,'amount_msat':2100000,'description_hash':'cd'*32,'expiry_seconds':3600,'network':'mainnet'}),
 ('HelperOperation',{'operation_id':uid(10),'operation_generation':None,'status':'unknown','input_fingerprint':None,'lease_generation':0,'lease_until':None,'bolt11':None,'payment_hash':None,'provider_invoice_id':None,'expires_at':None,'fenced':False}),
 ('Error',error),('KeyDocument',{'document':document,'signing_key_id':'test-root','signature':b64(root.sign(jcs(document)))}),
 ('UmaDiscoveryStart',{'receiver_address':'$john.doe@example.invalid'}),
 ('UmaPayResponseInput',{'exchange_id':uid(30),'request_id':uid(31),'response':{'url':'https://peer.example.invalid/callback','http_status':200,'content_type':'application/json','body_base64url':b64(b'{}')}}),
]
examples=[{'id':'valid-'+str(i),'schema':name,'valid':True,'value':value} for i,(name,value) in enumerate(valid)]
def negative(base,desc,change):
    v=copy.deepcopy(valid[base][1]);change(v);examples.append({'id':desc,'schema':valid[base][0],'valid':False,'value':v})
negative(0,'reject-client-approved',lambda x:x.update(approved=True))
negative(0,'reject-full-kyc-fields',lambda x:x['fields'].update(pep_status=False))
negative(0,'reject-missing-email',lambda x:x['fields'].pop('contact_email'))
negative(4,'reject-photo-over-limit',lambda x:x.update(plaintext_length=10485761))
negative(6,'reject-unbound-party-signature',lambda x:x['action_params'].pop('party_id'))
negative(6,'reject-wrong-key-length',lambda x:x.update(wallet_pubkey=PK[2:]))
negative(9,'reject-client-custody',lambda x:x.update(custodial=False))
negative(9,'reject-fractional-sat',lambda x:x.update(amount_msat=1001))
negative(9,'reject-unsafe-msat',lambda x:x.update(amount_msat=9007199254741000))
negative(9,'reject-two-recipient-kinds',lambda x:x.update(pos_id='pos-abcdefghij'))
negative(11,'reject-helper-missing-recipient',lambda x:x.pop('receiver_identity_pubkey'))
negative(8,'reject-ingest-empty',lambda x:x.update(items=[]))
negative(8,'reject-missing-event-version',lambda x:x['items'][0].pop('event_version'))
negative(16,'reject-plain-http-peer',lambda x:x['response'].update(url='http://peer.example.invalid/callback'))
write('schema-cases.json',{'description':'Schema-level examples only; semantic and cryptographic execution is separately required. All identities are synthetic.','cases':examples})
print('Generated',len(examples),'schema examples,',len(vectors),'HPKE cases,',len(auth),'wallet signatures, key document and observation vectors')
