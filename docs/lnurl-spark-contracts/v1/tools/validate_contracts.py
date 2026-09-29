"""Offline package verification. Does not contact services or execute payments."""
from pathlib import Path
import base64
import copy
import hashlib
import hmac
import json
import re
import sys
from datetime import datetime, timezone

if len(sys.argv)>1:sys.path.insert(0,str(Path(sys.argv[1]).resolve()))
import rfc8785
import jsonschema
from openapi_spec_validator import validate
from pyhpke import CipherSuite, KEMId, KDFId, AEADId
from coincurve import PublicKeyXOnly
from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

ROOT=Path(__file__).resolve().parents[1]
def read(name):return json.loads((ROOT/name).read_text(encoding='utf-8'))
def jcs(data):return rfc8785.dumps(data)
def unb64(s):return base64.urlsafe_b64decode(s+'='*((-len(s))%4))
def sha(b):return hashlib.sha256(b).hexdigest()
counts={}
def passed(group):counts[group]=counts.get(group,0)+1
def check(condition,group,message):
    if not condition:raise AssertionError(message)
    passed(group)

schemas=read('schemas.json');jsonschema.Draft202012Validator.check_schema(schemas)
for name,schema in schemas['$defs'].items():
    jsonschema.Draft202012Validator.check_schema(schema);passed('schemas')

specs={}
for filename in ['openapi-public.json','openapi-internal.json','openapi-helper.json']:
    spec=read(filename);validate(spec,base_uri=(ROOT/filename).as_uri());specs[filename]=spec;passed('openapi_documents')
    seen=set()
    for path,methods in spec['paths'].items():
        for method,op in methods.items():
            check(op['operationId'] not in seen,'operation_ids',filename+': duplicate operation ID')
            seen.add(op['operationId'])
            required=set(re.findall(r'{([^}]+)}',path))
            actual={p['name'] for p in op.get('parameters',[]) if p['in']=='path' and p['required']}
            check(required==actual,'path_parameters',filename+': missing path parameter '+path)

def checkrefs(value):
    if isinstance(value,dict):
        for key,val in value.items():
            if key=='$ref':
                filename,_,pointer=val.partition('#')
                doc=read(filename) if filename else schemas
                for part in pointer.lstrip('/').split('/'):
                    if part:doc=doc[part.replace('~1','/').replace('~0','~')]
                passed('references')
            else:checkrefs(val)
    elif isinstance(value,list):
        for val in value:checkrefs(val)
checkrefs(schemas)
for spec in specs.values():checkrefs(spec)

for case in read('fixtures/schema-cases.json')['cases']:
    validator=jsonschema.Draft202012Validator({'$ref':'#/$defs/'+case['schema'],'$defs':schemas['$defs']},format_checker=jsonschema.FormatChecker())
    errors=list(validator.iter_errors(case['value']))
    check((not errors)==case['valid'],'schema_examples',case['id']+': '+str(errors[:1]))

pub=specs['openapi-public.json'];internal=specs['openapi-internal.json']
for r in read('route-map.json')['routes']:
    p=pub['paths'][r['public_path']][r['method'].lower()];i=internal['paths'][r['internal_path']][r['method'].lower()]
    check(p['operationId']==i['operationId']==r['operation_id'],'forwarding',r['public_path'])
    check(i['security']==[{'ServiceBearer':[]}],'service_auth',r['public_path'])
    check(i['x-opago-end-user-policy']==r['auth'],'user_auth',r['public_path'])
check(pub['paths']['/api/v2/account']['delete']['security']==[{'AccountBearer':[]}],'security_invariants','Account deletion must not use wallet authentication')
check(pub['paths']['/api/v2/wallet/restore']['post']['security']==[{'AccountBearer':[]}],'security_invariants','Restore must work without a wallet session')
check(pub['paths']['/lnurlp/cb/{context_ref}']['get']['x-opago-transport']=='lnurl','security_invariants','No HPKE for foreign LNURL wallets')
check('custodial' not in json.dumps(schemas['$defs']['CreateRegistration']),'security_invariants','Client cannot select custody')

for v in read('fixtures/wallet-auth-vectors.json')['vectors']:
    m=bytes.fromhex(v['message_hex']);signature=bytes.fromhex(v['signature_hex']);pubkey=PublicKeyXOnly(bytes.fromhex(v['xonly_public_key_hex']))
    check(m==v['message'].encode() and not m.endswith(b'\n'),'wallet_auth_bytes','Message encoding')
    check(sha(m)==v['msg32_hex'],'wallet_auth_bytes','Message digest')
    check(pubkey.verify(signature,bytes.fromhex(sha(m))),'wallet_auth_signatures','BIP-340 verification')
    for changed in [m+b'\n',m.replace(b'api.opago.com',b'other.invalid'),m.replace(b'mainnet',b'regtest'),m.replace(b'action:',b'action: other')]:
        check(not pubkey.verify(signature,bytes.fromhex(sha(changed))),'wallet_auth_negative','Changed message accepted')

suite=CipherSuite.new(KEMId.DHKEM_X25519_HKDF_SHA256,KDFId.HKDF_SHA256,AEADId.AES256_GCM)
def context(v):
    return suite.create_recipient_context(unb64(v['envelope']['enc']),suite.kem.deserialize_private_key(bytes.fromhex(v['test_receiver_private_key_hex'])),info=bytes.fromhex(v['info_hex']))

# Independent RFC 9180 key-schedule check, QA only (not a production HPKE library).
def extract(salt,ikm):return hmac.new(salt or bytes(32),ikm,hashlib.sha256).digest()
def expand(prk,info,length):
    result=b'';block=b''
    for i in range(1,(length+31)//32+1):block=hmac.new(prk,block+info+bytes([i]),hashlib.sha256).digest();result+=block
    return result[:length]
def lx(sid,salt,label,ikm):return extract(salt,b'HPKE-v1'+sid+label+ikm)
def le(sid,prk,label,info,length):return expand(prk,length.to_bytes(2,'big')+b'HPKE-v1'+sid+label+info,length)
def reference_keys(v):
    sk=x25519.X25519PrivateKey.from_private_bytes(bytes.fromhex(v['test_receiver_private_key_hex']))
    enc=unb64(v['envelope']['enc']);pkr=sk.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)
    kem_id=b'KEM'+bytes.fromhex('0020');sid=b'HPKE'+bytes.fromhex('002000010002')
    eae=lx(kem_id,b'',b'eae_prk',sk.exchange(x25519.X25519PublicKey.from_public_bytes(enc)))
    shared=le(kem_id,eae,b'shared_secret',enc+pkr,32)
    c=b'\0'+lx(sid,b'',b'psk_id_hash',b'')+lx(sid,b'',b'info_hash',bytes.fromhex(v['info_hex']))
    secret=lx(sid,shared,b'secret',b'');export=le(sid,secret,b'exp',c,32)
    return le(sid,secret,b'key',c,32),le(sid,secret,b'base_nonce',c,12),lambda label:le(sid,export,b'sec',label,32)

for v in read('fixtures/hpke-vectors.json')['vectors']:
    aad=jcs(v['aad']);ct=unb64(v['envelope']['ciphertext']);ctx=context(v)
    check(aad.hex()==v['aad_hex'],'hpke_canonical_bytes',v['name'])
    check(ctx.open(ct,aad)==bytes.fromhex(v['plaintext_hex'])==jcs(v['plaintext']),'hpke_decryption',v['name'])
    key,iv,export=reference_keys(v)
    check(AESGCM(key).decrypt(iv,ct,aad)==jcs(v['plaintext']),'hpke_independent_key_schedule',v['name'])
    check(export(b'opago-response')==ctx.export(b'opago-response',32)==bytes.fromhex(v['response_export_key_hex']),'hpke_exporter',v['name'])
    ra=jcs({'request_aad':v['aad'],'http_status':v['response_status']});rv=v['response']
    check(AESGCM(export(b'opago-response')).decrypt(unb64(rv['nonce']),unb64(rv['ciphertext']),ra)==jcs(v['response_plaintext']),'hpke_response',v['name'])
    for field,replacement in [('method','PATCH'),('path','/api/v2/account'),('query',[['side','back']]),('audience','https://evil.invalid'),('idempotency_key','00000000-0000-4000-8000-999999999999')]:
        bad=copy.deepcopy(v['aad']);bad[field]=replacement
        try:context(v).open(ct,jcs(bad))
        except Exception:passed('hpke_negative_aad')
        else:raise AssertionError('Changed AAD accepted: '+field)
    try:AESGCM(export(b'opago-response')).decrypt(unb64(rv['nonce']),unb64(rv['ciphertext']),jcs({'request_aad':v['aad'],'http_status':418}))
    except InvalidTag:passed('hpke_negative_status')
    else:raise AssertionError('Changed response status accepted')
    if 'photo_body_hex' in v:
        body=bytes.fromhex(v['photo_body_hex']);pa=jcs({'request_aad':v['aad'],'document':v['plaintext']})
        check(export(b'opago-photo')==ctx.export(b'opago-photo',32)==bytes.fromhex(v['photo_export_key_hex']),'photo_exporter','Photo key')
        check(AESGCM(export(b'opago-photo')).decrypt(body[:12],body[12:],pa)==bytes.fromhex(v['photo_plaintext_hex']),'photo_decryption','Photo bytes')
        bad=copy.deepcopy(v['plaintext']);bad['side']='back'
        try:AESGCM(export(b'opago-photo')).decrypt(body[:12],body[12:],jcs({'request_aad':v['aad'],'document':bad}))
        except InvalidTag:passed('photo_negative_binding')
        else:raise AssertionError('Photo side not authenticated')

kd=read('fixtures/hpke-key-document-vectors.json');pubroot=ed25519.Ed25519PublicKey.from_public_bytes(bytes.fromhex(kd['root_public_key_hex']))
check(jcs(kd['response']['document']).hex()==kd['signed_bytes_hex'],'key_document','JCS bytes')
pubroot.verify(unb64(kd['response']['signature']),jcs(kd['response']['document']));passed('key_document_signature')
for field,value in [('active_kid','attacker-key'),('audience','https://attacker.invalid')]:
    bad=copy.deepcopy(kd['response']['document']);bad[field]=value
    try:pubroot.verify(unb64(kd['response']['signature']),jcs(bad))
    except InvalidSignature:passed('key_document_negative')
    else:raise AssertionError('Modified key document accepted')

obs=read('fixtures/observation-vectors.json');items=obs['vectors']
for v in items:
    o=v['observation'];check(sha(bytes.fromhex(v['family_bytes_hex']))==o['observation_family_id'],'observation_hashes','Family')
    check(sha(bytes.fromhex(v['version_bytes_hex']))==o['event_version'],'observation_hashes','Version')
    check(sha(bytes.fromhex(v['event_bytes_hex']))==o['event_id'],'observation_hashes','Event')
check(items[0]['observation']['event_id']==items[1]['observation']['event_id'],'observation_semantics','Reinstall must not create another event')
check(items[0]['observation']['event_id']!=items[2]['observation']['event_id'],'observation_semantics','Same-status correction must have a new ID')
check(items[0]['observation']['observation_family_id']==items[2]['observation']['observation_family_id'],'observation_semantics','Same-status correction belongs to same family')

acceptance=read('acceptance.json')
check(len({c['id'] for c in acceptance['scenarios']})==len(acceptance['scenarios']),'acceptance_catalog','Duplicate acceptance IDs')
report={'contract_version':'0.1.0','result':'passed','checked_at':datetime.now(timezone.utc).isoformat(),'checks':counts,'total_checks':sum(counts.values()),'public_operations':sum(len(x) for x in pub['paths'].values()),'internal_operations':sum(len(x) for x in internal['paths'].values()),'helper_operations':sum(len(x) for x in specs['openapi-helper.json']['paths'].values()),'implementation_scenarios':{'count':len(acceptance['scenarios']),'status':'NOT_EXECUTED'},'not_proven':['Spark SDK F2 behavior','Python/JavaScript UMA interoperability','Android/iOS native HPKE execution','deployed services, concurrency and device acceptance','legal retention approval']}
(ROOT/'validation-report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
