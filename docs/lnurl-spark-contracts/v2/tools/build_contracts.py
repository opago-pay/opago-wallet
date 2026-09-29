"""Build the standalone OPAGO V7 contract handoff; no application/network effects."""
from pathlib import Path
import copy
import json
import re

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.2.0'
S = {}

def obj(properties, required=None, **kw):
    return dict(type='object', properties=properties, required=list(properties) if required is None else required, additionalProperties=False, **kw)

def string(maximum=256, **kw):
    return {'type':'string','minLength':1,'maxLength':maximum,**kw}

def enum(*values):
    return dict(type='string', enum=list(values))

def array(item, maximum=100):
    return dict(type='array', items=item, maxItems=maximum)

def ref(name):
    return {'$ref': '#/$defs/' + name}

def nullable(schema):
    return {'anyOf': [schema, {'type': 'null'}]}

def number(minimum=0, maximum=9007199254740991):
    return dict(type='integer', minimum=minimum, maximum=maximum)

UUID = string(36, format='uuid')
TIME = string(30, format='date-time', pattern=r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
HASH = string(64, pattern='^[0-9a-f]{64}$')
PUBKEY = string(66, pattern='^0[23][0-9a-f]{64}$')
B64 = string(750000, pattern='^[A-Za-z0-9_-]+$')
TOKEN = string(8192)
NETWORK = enum('mainnet', 'regtest')
MSAT = dict(number(1000), multipleOf=1000)
NAME = string(32, minLength=3, pattern=r'^(?!.*\.\.)[a-z0-9][a-z0-9._-]*[a-z0-9]$')
BOOL = {'type': 'boolean'}
URL = string(2048, format='uri', pattern='^https://')
S['Empty'] = obj({})
S['Error'] = obj({'error': obj({'code': string(80), 'message': string(256), 'retryable': BOOL, 'details': {'type': 'object', 'additionalProperties': True}}), 'request_id': UUID})
S['Error']['properties']['error']['allOf'] = [
 {'if': {'properties': {'code': {'const': 'tme_rejected'}}}, 'then': {'properties': {'retryable': {'const': False}}}},
 {'if': {'properties': {'code': {'enum': ['tme_pending','tme_unavailable']}}}, 'then': {'properties': {'retryable': {'const': True}}}}
]
S['Ok'] = obj({'status': enum('ok')})
S['HpkeRequest'] = obj({'encryption': {'const': 'hpke-v1'}, 'kid': string(64, pattern='^[A-Za-z0-9_-]+$'), 'enc': string(43, pattern='^[A-Za-z0-9_-]{43}$'), 'nonce': string(22, pattern='^[A-Za-z0-9_-]{22}$'), 'issued_at': TIME, 'ciphertext': B64})
S['HpkeResponse'] = obj({'encryption': {'const': 'hpke-v1'}, 'nonce': string(16, pattern='^[A-Za-z0-9_-]{16}$'), 'ciphertext': B64})
S['KeyDocument'] = obj({'document': obj({'audience': URL, 'issued_at': TIME, 'active_kid': string(64), 'keys': array(obj({'kid': string(64), 'public_key': string(43, pattern='^[A-Za-z0-9_-]{43}$'), 'not_after': TIME}), 8)}), 'signing_key_id': string(64), 'signature': string(86, pattern='^[A-Za-z0-9_-]{86}$')})
S['AppConfig'] = obj({'contract_version': {'const': VERSION}, 'audience': URL, 'issued_at': TIME, 'valid_until': TIME, 'cache_max_age': number(0, 300), 'min_supported_build': obj({'ios': number(1), 'android': number(1)}), 'revoked_signing_key_ids': array(string(64)), 'revoked_kids': array(string(64)), 'oidc': obj({'issuer': URL, 'client_id': string(128), 'redirect_uris': array(string(512), 4), 'scopes': array(enum('openid', 'email', 'profile'), 3)}), 'limits': obj({'min_sendable_msat': MSAT, 'max_sendable_msat': MSAT, 'photo_bytes': {'const': 10485760}, 'photo_pixels': {'const': 24000000}})})

actions = {
 'login': {}, 'onboarding_restart': {}, 'wallet_bind': {'party_id': UUID, 'account_generation': number(1)},
 'address_bind': {'name': NAME}, 'address_rename': {'name': NAME},
 'address_deactivate': {'address_id': UUID}, 'address_reactivate': {'address_id': UUID},
 'wallet_close': {'wallet_id': UUID},
 'wallet_restore': {'wallet_id': UUID, 'party_id': UUID, 'account_generation': number(1)},
 'pos_bind': {'pos_id': string(14, pattern='^pos-[a-z2-7]{10}$'), 'binding_intent_id': UUID, 'binding_version': number(1)},
 'payer_proof': {'context_ref': string(43, pattern='^[A-Za-z0-9_-]{43}$'), 'amount_msat': MSAT}}
S['ChallengeRequest'] = {'oneOf': [obj({'wallet_pubkey': PUBKEY, 'network': NETWORK, 'action': {'const': action}, 'action_params': obj(params), 'installation_id': UUID}) for action, params in actions.items()]}
S['Challenge'] = obj({'challenge_id': UUID, 'message': string(4096), 'expires_at': TIME})
S['VerifyRequest'] = obj({'challenge_id': UUID, 'signature': string(128, pattern='^[0-9a-f]{128}$'), 'installation_id': UUID})
S['WalletSession'] = obj({'kind': {'const': 'session'}, 'access_token': TOKEN, 'access_expires_at': TIME, 'refresh_token': TOKEN, 'refresh_expires_at': TIME, 'wallet_id': UUID, 'scope': enum('onboarding', 'wallet')})
S['ActionProof'] = obj({'kind': {'const': 'proof'}, 'proof_token': TOKEN, 'action': enum(*[a for a in actions if a != 'login']), 'wallet_id': UUID, 'expires_at': TIME})
S['VerifyResponse'] = {'oneOf': [ref('WalletSession'), ref('ActionProof')]}
S['RefreshRequest'] = obj({'refresh_token': TOKEN, 'installation_id': UUID})
S['ProofRequest'] = obj({'proof_token': TOKEN})
S['WalletBindingRequest'] = obj({'wallet_pubkey': PUBKEY, 'network': NETWORK, 'installation_id': UUID, 'party_id': UUID, 'account_generation': number(1), 'proof_token': TOKEN, 'submission_id': nullable(UUID)}, ['wallet_pubkey','network','installation_id','party_id','account_generation','proof_token'])
S['Account'] = obj({'party_id': UUID, 'account_generation': number(1), 'email_verified': BOOL, 'wallets': array(obj({'wallet_id': UUID, 'network': NETWORK, 'wallet_pubkey': PUBKEY, 'custodial': BOOL, 'status': enum('active','closed','deleted')})), 'wallet_photo_match_status': enum('none','pending','passed','mismatch','unreadable'), 'identification_status': enum('identified','unidentified'), 'identification_source': nullable(enum('full_kyc','opago_kyb'))})
S['Wallet'] = obj({'wallet_id': UUID, 'network': NETWORK, 'wallet_pubkey': PUBKEY, 'custodial': BOOL, 'status': enum('unbound','active','closed','deleted'), 'party_id': nullable(UUID), 'address': nullable(ref('Address')), 'photo_match': nullable(ref('PhotoMatchSummary'))})
S['RestoreRequest'] = obj({'wallet_id': UUID, 'proof_token': TOKEN, 'installation_id': UUID})
S['DeletionReceipt'] = obj({'deletion_id': UUID, 'status': {'const': 'deletion_pending'}, 'requested_at': TIME, 'receipt_token': TOKEN, 'receipt_expires_at': TIME})
S['DeletionStatus'] = obj({'deletion_id': UUID, 'status': enum('deletion_pending','deleted'), 'access_revoked_at': TIME, 'identity_account_deleted_at': nullable(TIME), 'retained_data': BOOL})

FIELDS = {'given_name': string(100), 'family_name': string(100), 'date_of_birth': string(10, format='date'), 'document_number': string(64), 'document_expiry': string(10, format='date'), 'nationality': string(3, pattern='^[A-Z]{3}$'), 'contact_email': string(254, format='email'), 'document_type': enum('passport','identity_card')}
S['PhotoMatchFields'] = obj(FIELDS)
S['PhotoMatchSummary'] = obj({'submission_id': UUID, 'revision': number(1), 'status': enum('draft','submitted','in_review','approved','correction_requested','rejected'), 'active_approval_revision': nullable(number(1)), 'assurance': {'const': 'photo_data_match_only'}, 'match_result': nullable(enum('passed','mismatch','unreadable')), 'processing_status': enum('idle','queued','processing','retrying','completed','failed'), 'correction_fields': array(enum(*FIELDS.keys(), 'front','back'), 11), 'updated_at': TIME})
S['PhotoMatch'] = obj({**S['PhotoMatchSummary']['properties'], 'fields': ref('PhotoMatchFields'), 'documents': array(obj({'document_id': UUID, 'side': enum('front','back'), 'revision': number(1), 'original_sha256': HASH, 'stored_sha256': HASH, 'received_at': TIME}), 2), 'edit_version': number(1), 'contact_verification_required': BOOL})
S['CreatePhotoMatch'] = obj({'submission_id': UUID, 'fields': ref('PhotoMatchFields')})
S['UpdatePhotoMatch'] = obj({'revision': number(1), 'expected_edit_version': number(1), 'fields': ref('PhotoMatchFields')})
S['NewRevision'] = obj({'base_revision': number(1), 'expected_edit_version': number(1)})
S['SubmitPhotoMatch'] = obj({'revision': number(1), 'expected_edit_version': number(1)})
S['PhotoDescriptor'] = obj({'submission_id': UUID, 'revision': number(1), 'side': enum('front','back'), 'content_type': enum('image/jpeg','image/png'), 'plaintext_length': number(1,10485760), 'original_sha256': HASH, 'expected_edit_version': number(1)})
S['PhotoUploadResult'] = obj({'document_id': UUID, 'submission_id': UUID, 'revision': number(1), 'side': enum('front','back'), 'original_sha256': HASH, 'stored_sha256': HASH, 'edit_version': number(1)})

S['Address'] = obj({'address_id': UUID, 'name': NAME, 'address': string(64), 'status': enum('pending_kyc','active','deactivated','inactive'), 'bound_at': TIME, 'next_rename_allowed_at': nullable(TIME), 'lnurl': string(4096), 'qr_payload': string(4106)})
S['AddressSuggestion'] = obj({'name': NAME, 'available': BOOL})
S['AddressAvailability'] = obj({'name': NAME, 'available': BOOL, 'reason': nullable(enum('name_taken','name_reserved','name_invalid'))})
S['SetAddress'] = obj({'name': NAME, 'proof_token': TOKEN}, ['name'])

S['Observation'] = obj({'event_id': HASH, 'observation_family_id': HASH, 'event_version': HASH, 'supersedes_event_id': nullable(HASH), 'correction_reason': nullable(string(256)), 'seq': number(1), 'type': enum('lightning','spark_transfer','onchain','onramp'), 'direction': enum('incoming','outgoing'), 'status': enum('pending','settled','failed'), 'amount_msat': number(0), 'fee_msat': number(0), 'asset': {'const': 'BTC'}, 'payment_hash': nullable(HASH), 'spark_transfer_id': nullable(string(256)), 'provider_event_id': nullable(string(256)), 'bolt11': nullable(string(16384)), 'counterparty': obj({'lightning_address': nullable(string(320)), 'node_pubkey': nullable(PUBKEY), 'spark_pubkey': nullable(PUBKEY)}, []), 'description': string(1024, minLength=0), 'created_at': TIME, 'signed_at': nullable(TIME), 'settled_at': nullable(TIME)})
S['IngestRequest'] = obj({'installation_id': UUID, 'items': dict(array(ref('Observation')), minItems=1)})
S['IngestResult'] = obj({'results': array(obj({'event_id': HASH, 'seq': number(1), 'result': enum('accepted','duplicate','rejected_retryable','rejected_permanent'), 'transaction_id': nullable(UUID), 'code': nullable(string(80)), 'closure_token': nullable(TOKEN)})), 'last_acknowledged_seq': number(0), 'missing_seq': array(number(1),1000), 'missing_seq_truncated': BOOL})
S['Cursor'] = obj({'installation_id': UUID, 'last_acknowledged_seq': number(0), 'missing_seq': array(number(1),1000), 'missing_seq_truncated': BOOL})
S['CloseRejectedEvents'] = obj({'installation_id': UUID, 'items': dict(array(obj({'seq': number(1), 'event_id': HASH, 'closure_token': TOKEN})), minItems=1)})

S['Invoice'] = obj({'bolt11': string(16384), 'payment_hash': HASH, 'seq': number(1), 'status': enum('pending','paid','expired','voided','orphaned'), 'expires_at': TIME})
S['Registration'] = obj({'registration_id': UUID, 'status': enum('open','invoice_issued','expired_awaiting_refresh','paid','cancelled','rejected'), 'custodial': BOOL, 'amount_msat': MSAT, 'pre_check_id': nullable(UUID), 'pre_check_status': enum('ok','rejected','pending','unavailable'), 'tme_mode': enum('shadow','enforcing'), 'tme_policy_version': string(128), 'tme_policy_epoch': number(1), 'tme_blocked': BOOL, 'reject_reason': nullable(enum('custodial_not_licensed','travel_rule_unidentified','kyc_level_insufficient','tme_rejected')), 'pre_check_valid_until': nullable(TIME), 'invoice': nullable(ref('Invoice')), 'refreshed': BOOL, 'cancel_reason': nullable(enum('user','license_disabled','address_changed','address_deactivated','wallet_closed','account_deleted')), 'updated_at': TIME})
# These response constraints forbid exposing an invoice while TME blocks.
S['Registration']['allOf'] = [
 {'if': {'properties': {'tme_blocked': {'const': True}}}, 'then': {'properties': {'invoice': {'type': 'null'}}}},
 {'if': {'properties': {'tme_mode': {'const': 'enforcing'}, 'pre_check_status': {'enum': ['rejected','pending','unavailable']}}}, 'then': {'properties': {'tme_blocked': {'const': True}}}},
 {'if': {'properties': {'tme_mode': {'const': 'shadow'}}}, 'then': {'properties': {'tme_blocked': {'const': False}}}},
 {'if': {'properties': {'pre_check_status': {'const': 'ok'}}}, 'then': {'properties': {'pre_check_id': UUID, 'pre_check_valid_until': TIME}}},
 {'if': {'properties': {'custodial': {'const': True}}}, 'then': {'properties': {'tme_mode': {'const': 'enforcing'}}}},
 {'if': {'properties': {'status': {'const': 'rejected'}}}, 'then': {'properties': {'reject_reason': {'type': 'string'}, 'invoice': {'type': 'null'}}}},
 {'if': {'properties': {'reject_reason': {'const': 'tme_rejected'}}}, 'then': {'properties': {'status': {'const': 'rejected'}, 'tme_mode': {'const': 'enforcing'}, 'tme_blocked': {'const': True}, 'pre_check_status': {'const': 'rejected'}}}}
]
S['CreateRegistration'] = {'oneOf': [obj({'amount_msat': MSAT, target: UUID if target == 'wallet_id' else string(14,pattern='^pos-[a-z2-7]{10}$'), 'description': string(1024,minLength=0), 'external_reference': nullable(string(128))}, ['amount_msat',target,'description']) for target in ['wallet_id','pos_id']]}
S['LnurlDiscovery'] = obj({'tag': {'const':'payRequest'}, 'callback': URL, 'minSendable': MSAT, 'maxSendable': MSAT, 'metadata': string(4096)})
S['LnurlError'] = obj({'status': {'const':'ERROR'}, 'reason': string(256)})
S['LnurlInvoice'] = obj({'pr': string(16384), 'routes': {'type':'array','maxItems':0}})
S['LnurlDiscoveryResult'] = {'oneOf':[ref('LnurlDiscovery'),ref('LnurlError')]}
S['LnurlCallbackResult'] = {'oneOf':[ref('LnurlInvoice'),ref('LnurlError')]}
S['LnurlQuery'] = obj({'amount': string(16,pattern='^[1-9][0-9]*$')})

# UMA JSON is carried as exact bytes between app and backend. It is validated
# with the pinned UMA SDK, never an ad-hoc replacement signature serializer.
S['RawHttpsResponse'] = obj({'url': URL, 'http_status': number(100,599), 'content_type': string(128), 'body_base64url': string(350000,pattern='^[A-Za-z0-9_-]+$')})
S['UmaDiscoveryStart'] = obj({'receiver_address': string(320,pattern=r'^\$?[a-zA-Z0-9._-]+@[^/@:?#]+$')})
S['UmaExchange'] = obj({'exchange_id': UUID, 'expires_at': TIME, 'request': obj({'method': {'const':'GET'}, 'url': URL})})
S['UmaDiscoveryVerify'] = obj({'exchange_id': UUID, 'response': ref('RawHttpsResponse')})
S['UmaDiscoveryVerified'] = obj({'exchange_id': UUID, 'status': enum('uma_supported','lnurl_only'), 'callback': URL, 'min_sendable_msat': MSAT, 'max_sendable_msat': MSAT, 'metadata': string(4096), 'expires_at': TIME})
S['UmaPayRequestInput'] = obj({'exchange_id': UUID, 'amount_msat': MSAT, 'payer_proof': TOKEN}, ['exchange_id','amount_msat'])
S['UmaPayRequestOutput'] = obj({'exchange_id': UUID, 'request_id': UUID, 'expires_at': TIME, 'request': obj({'method': {'const':'POST'}, 'url': URL, 'content_type': {'const':'application/json'}, 'body_base64url': string(350000,pattern='^[A-Za-z0-9_-]+$')})})
S['UmaPayResponseInput'] = obj({'exchange_id': UUID, 'request_id': UUID, 'response': ref('RawHttpsResponse')})
S['UmaPayResponseOutput'] = obj({'exchange_id': UUID, 'travel_rule_exchange': enum('complete','failed'), 'bolt11': nullable(string(16384)), 'payment_hash': nullable(HASH), 'amount_msat': MSAT, 'network': NETWORK, 'invoice_description_hash': nullable(HASH), 'expires_at': nullable(TIME), 'failure_code': nullable(string(80))})
SIG = string(144,pattern='^[0-9a-f]+$')
uma_signature = {'signature':SIG,'signatureNonce':string(128),'signatureTimestamp':number(1)}
uma_payer_compliance = obj({**uma_signature,'kycStatus':enum('VERIFIED','NOT_VERIFIED','PENDING','UNKNOWN'),'utxos':array(string(128),100),'nodePubKey':PUBKEY,'utxoCallback':URL,'encryptedTravelRuleInfo':string(131072),'travelRuleFormat':{'const':'IVMS@101.2023'}},['signature','signatureNonce','signatureTimestamp','kycStatus','utxoCallback'])
uma_payer_compliance['additionalProperties']=True
S['UmaPayerData'] = obj({'identifier':string(320),'name':string(256),'email':string(254),'compliance':uma_payer_compliance},['identifier','compliance'])
S['UmaPayerData']['additionalProperties']=True
S['UmaPayRequest'] = obj({'amount':string(16,pattern='^[1-9][0-9]*$'),'convert':{'const':'BTC'},'umaVersion':{'const':'1.0'},'payerData':ref('UmaPayerData'),'payeeData':{'type':'object','additionalProperties':obj({'mandatory':BOOL})},'comment':string(256,minLength=0)},['amount','convert','payerData'])
S['UmaCurrency'] = obj({'code':{'const':'BTC'},'name':{'const':'Bitcoin'},'symbol':{'const':'BTC'},'multiplier':{'const':1000},'decimals':{'const':8},'convertible':obj({'min':number(1),'max':number(1)})})
S['UmaDiscoveryResponse'] = obj({**S['LnurlDiscovery']['properties'],'umaVersion':{'const':'1.0'},'currencies':dict(array(ref('UmaCurrency'),1),minItems=1),'payerData':{'type':'object','additionalProperties':obj({'mandatory':BOOL})},'compliance':obj({**uma_signature,'kycStatus':enum('VERIFIED','NOT_VERIFIED','PENDING','UNKNOWN'),'isSubjectToTravelRule':BOOL,'receiverIdentifier':string(320)})})
S['UmaPayResponse'] = obj({'pr':string(16384),'routes':{'type':'array','maxItems':0},'umaVersion':{'const':'1.0'},'converted':obj({'amount':number(1),'currencyCode':{'const':'BTC'},'multiplier':{'const':1000},'decimals':{'const':8},'fee':{'const':0},'exchangeFeesMillisatoshi':{'const':0}},['amount','currencyCode','multiplier','decimals','fee']),'payeeData':obj({'identifier':string(320),'name':string(256),'compliance':obj({**uma_signature,'utxos':array(string(128),100),'nodePubKey':PUBKEY,'utxoCallback':URL},['signature','signatureNonce','signatureTimestamp','utxos','utxoCallback'])},['identifier','compliance'])},['pr','routes','converted','payeeData'])
S['UmaPostTx'] = obj({**uma_signature,'vaspDomain':string(253),'utxos':array(obj({'utxo':string(128),'amountMsats':number(0)}),100),'transactionStatus':enum('COMPLETED','FAILED'),'errorCode':string(80),'errorReason':string(256)},['signature','signatureNonce','signatureTimestamp','vaspDomain','utxos'])
S['UmaPublicKeys'] = obj({'signingCertChain':dict(array(string(32768,pattern='^[0-9a-f]+$'),8),minItems=1),'encryptionCertChain':dict(array(string(32768,pattern='^[0-9a-f]+$'),8),minItems=1),'signingPubKey':string(130,pattern='^04[0-9a-f]{128}$'),'encryptionPubKey':string(130,pattern='^04[0-9a-f]{128}$'),'expirationTimestamp':number(0)},['signingCertChain','encryptionCertChain','signingPubKey','encryptionPubKey'])
S['UmaConfiguration'] = obj({'uma_major_versions': array(number(1,1),1)},description='OPAGO informational capability document; not a replacement for signed UMA negotiation.')

S['PosBindingIntentRequest'] = obj({'wallet_id': UUID, 'expected_binding_version': number(0)})
S['PosBindingIntent'] = obj({'binding_intent_id': UUID, 'pos_id': string(14), 'wallet_id': UUID, 'binding_version': number(1), 'expires_at': TIME, 'operator_confirmed': BOOL, 'recipient_confirmed': BOOL})
S['PosBindingConfirm'] = obj({'binding_intent_id': UUID, 'proof_token': TOKEN})
S['Pos'] = obj({'pos_id': string(14), 'address': string(64), 'binding_version': number(0), 'wallet_id': nullable(UUID), 'status': enum('unbound','active','disabled')})

S['HelperInvoiceRequest'] = obj({'operation_id': UUID, 'registration_id': UUID, 'attempt_seq': number(1), 'operation_generation': number(1), 'receiver_identity_pubkey': PUBKEY, 'amount_msat': MSAT, 'description_hash': HASH, 'expiry_seconds': number(60,3600), 'network': NETWORK})
S['HelperOperation'] = obj({'operation_id': UUID, 'operation_generation': number(1), 'status': enum('created','in_progress','interrupted','not_executed','unknown','unresolved'), 'input_fingerprint': nullable(HASH), 'lease_generation': number(0), 'lease_until': nullable(TIME), 'bolt11': nullable(string(16384)), 'payment_hash': nullable(HASH), 'provider_invoice_id': nullable(string(256)), 'expires_at': nullable(TIME), 'fenced': BOOL})
S['FenceOperation'] = obj({'expected_generation': number(1), 'reason': enum('request_outcome_unknown','lease_expired')})
S['HelperOperation']['properties']['operation_generation'] = nullable(number(1))
S['Transfers'] = obj({'network': NETWORK, 'wallet_pubkey': PUBKEY, 'coverage': enum('available','unsupported','privacy_restricted'), 'items': array(obj({'provider_transfer_id': string(256), 'payment_hash': nullable(HASH), 'amount_msat': number(0), 'status': enum('pending','settled','failed'), 'occurred_at': TIME}),500), 'next_cursor': nullable(string(1024))})

def externalize(value):
    if isinstance(value,dict):
        return {k: ('./schemas.json'+v if k=='$ref' and v.startswith('#/$defs/') else externalize(v)) for k,v in value.items()}
    if isinstance(value,list): return [externalize(v) for v in value]
    return value

def param(name, place, schema, required=True, description=None):
    d={'name':name,'in':place,'required':required,'schema':schema}
    if description:d['description']=description
    return d

ROUTES=[]
def route(method,path,op,request,response,auth='wallet',status=200,**kw):
    ROUTES.append(dict(method=method,path=path,op=op,request=request,response=response,auth=auth,status=status,**kw))

route('get','/api/v2/auth/hpke-key','getHpkeKeys',None,'KeyDocument','none',wire='plain',local=True)
route('get','/api/v2/app/config','getAppConfig',None,'AppConfig','none',wire='plain',local=True)
route('post','/api/v2/wallet/auth/challenge','createWalletChallenge','ChallengeRequest','Challenge','conditional',policy='protocol.md#auth')
route('post','/api/v2/wallet/auth/verify','verifyWalletChallenge','VerifyRequest','VerifyResponse','conditional',policy='protocol.md#auth')
route('post','/api/v2/wallet/auth/refresh','refreshWalletSession','RefreshRequest','WalletSession','none')
route('post','/api/v2/wallet/auth/logout','logoutWalletSession','RefreshRequest','Ok','none')
route('post','/api/v2/wallet/onboarding/restart','restartDeletedAccountOnboarding','ProofRequest','WalletSession','none')
route('get','/api/v2/account','getAccount',None,'Account','account')
route('post','/api/v2/account/wallets','bindWalletToAccount','WalletBindingRequest','Wallet','account_fresh',status=201)
route('delete','/api/v2/account','deleteAccount','Empty','DeletionReceipt','account_fresh',status=202)
route('get','/api/v2/account/deletions/{deletion_id}','getAccountDeletion',None,'DeletionStatus','receipt')
route('get','/api/v2/wallet/me','getWallet',None,'Wallet','wallet_or_bootstrap')
route('post','/api/v2/wallet/close','closeWallet','ProofRequest','Wallet')
route('post','/api/v2/wallet/restore','restoreWallet','RestoreRequest','WalletSession','account_fresh')
route('post','/api/v2/onboarding/kyc','createPhotoMatch','CreatePhotoMatch','PhotoMatch','bootstrap',status=201)
route('get','/api/v2/onboarding/kyc/{submission_id}','getPhotoMatch',None,'PhotoMatch','owner')
route('put','/api/v2/onboarding/kyc/{submission_id}','updatePhotoMatch','UpdatePhotoMatch','PhotoMatch','owner')
route('delete','/api/v2/onboarding/kyc/{submission_id}','discardPhotoMatchDraft','Empty','Ok','owner')
route('post','/api/v2/onboarding/kyc/{submission_id}/revisions','createPhotoMatchRevision','NewRevision','PhotoMatch','account',status=201)
route('post','/api/v2/onboarding/kyc/{submission_id}/submit','submitPhotoMatch','SubmitPhotoMatch','PhotoMatch','owner',status=202)
route('post','/api/v2/onboarding/kyc/{submission_id}/documents','uploadPhoto','PhotoDescriptor','PhotoUploadResult','owner',status=201,wire='photo',query=[param('revision','query',number(1)),param('side','query',enum('front','back'))])
route('get','/api/v2/wallet/address/suggestion','suggestAddress',None,'AddressSuggestion')
route('get','/api/v2/wallet/address/availability','checkAddress','AddressSuggestion','AddressAvailability',plaintext_get='name-only',query=[param('name','query',NAME)])
route('put','/api/v2/wallet/address','setAddress','SetAddress','Address')
route('post','/api/v2/wallet/address/deactivate','deactivateAddress','ProofRequest','Address')
route('post','/api/v2/wallet/address/reactivate','reactivateAddress','ProofRequest','Address')
route('post','/api/v2/wallet/transactions','ingestObservations','IngestRequest','IngestResult',limit=524288)
route('get','/api/v2/wallet/transactions/cursor','getIngestCursor',None,'Cursor',query=[param('installation_id','query',UUID)])
route('get','/api/v2/wallet/transactions/batches/{idempotency_key}','getIngestBatch',None,'IngestResult',query=[param('installation_id','query',UUID)])
route('post','/api/v2/wallet/transactions/close-rejected','closeRejectedObservations','CloseRejectedEvents','Cursor')
route('post','/api/v2/payments/registrations','createPaymentRegistration','CreateRegistration','Registration','wallet_or_pos',status=201)
route('get','/api/v2/payments/registrations/{registration_id}','getPaymentRegistration',None,'Registration','wallet_or_pos')
route('post','/api/v2/payments/registrations/{registration_id}/invoice','getOrRefreshInvoice','Empty','Registration','wallet_or_pos')
route('post','/api/v2/payments/registrations/{registration_id}/cancel','cancelRegistration','Empty','Registration','wallet_or_pos')
route('post','/api/v2/wallet/travel-rule/uma-discovery','startUmaDiscovery','UmaDiscoveryStart','UmaExchange')
route('post','/api/v2/wallet/travel-rule/uma-discovery/verify','verifyUmaDiscovery','UmaDiscoveryVerify','UmaDiscoveryVerified',limit=524288)
route('post','/api/v2/wallet/travel-rule/uma-pay-request','createUmaPayRequest','UmaPayRequestInput','UmaPayRequestOutput')
route('post','/api/v2/wallet/travel-rule/uma-pay-response','verifyUmaPayResponse','UmaPayResponseInput','UmaPayResponseOutput',limit=524288)
route('get','/api/v2/pos/{pos_id}','getPos',None,'Pos','operator')
route('post','/api/v2/pos/{pos_id}/binding-intents','createPosBindingIntent','PosBindingIntentRequest','PosBindingIntent','operator_fresh',status=201)
route('post','/api/v2/pos/{pos_id}/bindings','confirmPosBinding','PosBindingConfirm','Pos','wallet')
route('get','/.well-known/lnurlp/{name}','discoverLnurl',None,'LnurlDiscoveryResult','none',wire='lnurl',host='https://opago.com',internal='/api/lightning-addresses/{name}/discovery',query=[param('umaVersion','query',enum('1.0'),False),param('vaspDomain','query',string(253),False),param('nonce','query',string(128),False),param('timestamp','query',number(0),False),param('signature','query',string(144,pattern='^[0-9a-f]+$'),False),param('isSubjectToTravelRule','query',BOOL,False)])
route('get','/lnurlp/cb/{context_ref}','getLnurlInvoice',None,'LnurlCallbackResult','none',wire='lnurl',internal='/api/lightning-addresses/contexts/{context_ref}/invoice',query=[param('amount','query',string(16,pattern='^[1-9][0-9]*$'))])
route('post','/lnurlp/cb/{context_ref}','postUmaInvoice','UmaPayRequest','UmaPayResponse','none',wire='lnurl',internal='/api/lightning-addresses/contexts/{context_ref}/invoice')
route('post','/api/v2/uma/settlement/{context_ref}','recordUmaSettlementObservation','UmaPostTx','Empty','none',wire='plain',internal='/api/travel-rule/uma/settlement/{context_ref}')
route('get','/.well-known/lnurlpubkey','getUmaKeys',None,'UmaPublicKeys','none',wire='plain',host='https://opago.com',internal='/api/travel-rule/uma/keys')
route('get','/.well-known/uma-configuration','getUmaConfig',None,'UmaConfiguration','none',wire='plain',host='https://opago.com',internal='/api/travel-rule/uma/configuration')

AUTH = {
 'none':[{}], 'conditional':[{}, {'AccountBearer':[]}, {'WalletBearer':[]}],
 'wallet':[{'WalletBearer':[]}], 'bootstrap':[{'WalletBearer':[]}], 'wallet_or_bootstrap':[{'WalletBearer':[]}],
 'account':[{'AccountBearer':[]}], 'account_fresh':[{'AccountBearer':[]}],
 'owner':[{'WalletBearer':[]},{'AccountBearer':[]}], 'receipt':[{'DeletionReceiptBearer':[]}],
 'wallet_or_pos':[{'WalletBearer':[]},{'PosBearer':[]}],
 'operator':[{'AccountBearer':[]}], 'operator_fresh':[{'AccountBearer':[]}]}

def api(title):
    return {'openapi':'3.1.1','info':{'title':title,'version':VERSION,'description':'Implementation contract based on OPAGO plan V7. NOT a deployed API. Read protocol.md and decisions.md; x-opago-* fields are normative.'},'servers':[{'url':'https://api.opago.com'}],'paths':{},'components':{'securitySchemes':{n:{'type':'http','scheme':'bearer','description':d} for n,d in {'WalletBearer':'Internal-issued wallet access token, scoped to one wallet and installation.','AccountBearer':'Keycloak account access token; issuer/audience/auth_time and party are verified internally.','PosBearer':'Device credential restricted to the registered POS.','DeletionReceiptBearer':'Opaque receipt only for the corresponding deletion status.','ServiceBearer':'Service credential; never substitutes end-user authorization.'}.items()}}}

public=api('OPAGO Wallet and LNURL public API')
internal=api('OPAGO Wallet and LNURL internal API')
internal['servers']=[{'url':'https://internal-api.opago-internal.invalid','description':'Deployment placeholder; set through trusted service configuration, never from clients.'}]
helper=api('OPAGO Spark invoice helper')
helper['servers']=[{'url':'https://spark-helper.opago-internal.invalid','description':'Deployment placeholder, no public ingress.'}]
forward=[]

def schema_ref(n):return {'$ref':'./schemas.json#/$defs/'+n}
def content(n): return {'application/json':{'schema':schema_ref(n)}}
def response(n, description='Success'):return {'description':description,'headers':{'X-Request-Id':{'schema':UUID},'Cache-Control':{'schema':{'const':'no-store'}},'Retry-After':{'schema':number(1),'description':'Delay in seconds when retry is appropriate; transient TME issuance errors default to 5. See tme-v7.md.'}},'content':content(n)}

for r in ROUTES:
    method,path=r['method'],r['path']; wire=r.get('wire','hpke'); protected=wire in ('hpke','photo')
    op={'operationId':r['op'],'summary':r['op'],'security':AUTH[r['auth']], 'x-opago-auth-policy':r['auth'], 'x-opago-transport':wire,'x-opago-max-plaintext-bytes':10485760 if wire=='photo' else r.get('limit',65536),'parameters':[], 'responses':{},'description':'Normative lifecycle, authorization and retry rules: protocol.md.'}
    for p in re.findall(r'{([^}]+)}',path):
        ptype = string(33,pattern=r'^\$?(?!.*\.\.)[a-z0-9][a-z0-9._-]*[a-z0-9]$') if p=='name' else string(14,pattern='^pos-[a-z2-7]{10}$') if p=='pos_id' else string(43,pattern='^[A-Za-z0-9_-]{43}$') if p=='context_ref' else UUID
        op['parameters'].append(param(p,'path',ptype))
    op['parameters']+=r.get('query',[])
    if protected:
        op['parameters'] += [param('X-Opago-App-Build','header',number(1)),param('X-Opago-Platform','header',enum('ios','android','pos'))]
        if method!='get':op['parameters'].append(param('Idempotency-Key','header',UUID))
        plaintext = r['request'] or 'Empty'
        if r.get('plaintext_get'):plaintext='Empty'
        op['x-opago-plaintext-request']=schema_ref(plaintext)
        op['x-opago-plaintext-response']=schema_ref(r['response'])
        op['x-opago-plaintext-error']=schema_ref('Error')
        if method in ('get','delete') or wire=='photo':
            op['parameters'].append(param('X-Opago-Envelope','header',B64,description='Unpadded base64url of UTF-8 JCS HpkeRequest JSON. Photo plaintext is PhotoDescriptor.'))
        if wire=='photo':
            op['requestBody']={'required':True,'content':{'application/octet-stream':{'schema':{'type':'string','format':'binary','description':'12-byte AES-GCM nonce || encrypted photo || 16-byte tag; see protocol.md.'}}}}
        elif method not in ('get','delete'):
            op['requestBody']={'required':True,'content':content('HpkeRequest')}
        op['responses'][str(r['status'])]=response('HpkeResponse')
        op['responses']['default']=response('HpkeResponse','Authenticated errors are encrypted. Before successful HPKE authentication only minimal plain Error is possible; see protocol.md.')
        op['responses']['default']['content']['application/json']['schema']={'oneOf':[schema_ref('HpkeResponse'),schema_ref('Error')]}
    else:
        if r['request']:op['requestBody']={'required':True,'content':content(r['request'])}
        op['responses'][str(r['status'])]=response(r['response'])
        op['responses']['default']=response('LnurlError' if wire=='lnurl' else 'Error','Protocol error')
        if r['op']=='discoverLnurl':op['responses']['200']['content']['application/json']['schema']={'oneOf':[schema_ref('LnurlDiscoveryResult'),schema_ref('UmaDiscoveryResponse')]}
    if r.get('host'):op['servers']=[{'url':r['host']}]
    public['paths'].setdefault(path,{})[method]=op
    if r.get('local'):continue
    target=r.get('internal',path.replace('/api/v2/','/api/').replace('/api/wallet/travel-rule/uma-','/api/travel-rule/uma/'))
    io=copy.deepcopy(op);io.pop('servers',None);io['security']=[{'ServiceBearer':[]}]
    io['x-opago-end-user-policy']=r['auth'];io['x-opago-transport']='tls-internal'
    io['parameters']=[p for p in io['parameters'] if p['name']!='X-Opago-Envelope']
    io['parameters'] += [param('X-Opago-User-Authorization','header',string(8200),r['auth'] not in ('none','conditional'), 'Original Bearer credential; stripped from untrusted ingress then set by the facade. api-internal MUST independently verify token and policy.'), param('X-Request-Id','header',UUID)]
    if protected:
        io['responses']={str(r['status']):response(r['response']), 'default':response('Error','Business error, identical HTTP status and error code')}
        for k in ['x-opago-plaintext-request','x-opago-plaintext-response','x-opago-plaintext-error']:io.pop(k,None)
        io.pop('requestBody',None)
        if wire=='photo':
            io['parameters'].append(param('X-Opago-Photo-Descriptor','header',B64,description='Base64url JCS PhotoDescriptor, authenticated by public HPKE before forwarding.'))
            io['requestBody']={'required':True,'content':{'application/octet-stream':{'schema':{'type':'string','format':'binary','description':'Decrypted, bounded photo over authenticated internal TLS; encrypt at rest before commit.'}}}}
        elif method not in ('get','delete'):
            io['requestBody']={'required':True,'content':content(r['request'] or 'Empty')}
    internal['paths'].setdefault(target,{})[method]=io
    forward.append({'method':method.upper(),'public_path':path,'internal_path':target,'auth':r['auth'],'transport':wire,'operation_id':r['op']})

for method,path,op,req,res in [
 ('post','/internal/spark/invoices','createHelperInvoice','HelperInvoiceRequest','HelperOperation'),
 ('get','/internal/spark/operations/{operation_id}','getHelperOperation',None,'HelperOperation'),
 ('post','/internal/spark/operations/{operation_id}/fence','fenceHelperOperation','FenceOperation','HelperOperation'),
 ('get','/internal/spark/wallets/{pubkey}/transfers','getHelperTransfers',None,'Transfers')]:
    params=[param(p,'path',PUBKEY if p=='pubkey' else UUID) for p in re.findall(r'{([^}]+)}',path)]
    if op=='getHelperTransfers':params += [param('network','query',NETWORK),param('cursor','query',string(1024),False)]
    item={'operationId':op,'summary':op,'security':[{'ServiceBearer':[]}],'parameters':params,'responses':{'200':response(res),'default':response('Error','Helper error')},'description':'Only svc-spark-helper. Durable execution and fencing semantics in protocol.md; missing row is unknown, never proof of not_executed.'}
    if req:item['requestBody']={'required':True,'content':content(req)}
    helper['paths'].setdefault(path,{})[method]=item

def write(name,value):
    (ROOT/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':
    write('schemas.json',{'$schema':'https://json-schema.org/draft/2020-12/schema','$defs':S})
    for name,d in [('openapi-public.json',public),('openapi-internal.json',internal),('openapi-helper.json',helper)]:write(name,d)
    write('route-map.json',{'version':VERSION,'routes':forward})
    print(f'{len(ROUTES)} public operations, {len(forward)} forwarded operations, 4 helper operations, {len(S)} schemas')
