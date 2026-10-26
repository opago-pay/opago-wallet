"""Wallet production JS -> TLS -> actual public API blueprint -> TLS -> synthetic internal.
No product config, real identity images or live account changes. API source stays unchanged.
Run with the API application's existing requirements-test.txt environment.
"""
import argparse
import base64
import copy
import hashlib
import importlib.util
import json
import logging
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from uuid import uuid4
from flask import Flask, jsonify, request
import pytest
from werkzeug.serving import make_server

ROOT = Path(__file__).resolve().parents[1]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name,path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api',required=True,type=Path)
    parser.add_argument('--result',type=Path,default=ROOT/'output/p3-http-result.json')
    args = parser.parse_args(); api = args.api.resolve()
    if not (api/'tests/test_wallet_v2.py').exists(): parser.error('API fixture/contract source missing')
    sys.stdout.reconfigure(encoding='utf-8'); sys.stderr.reconfigure(encoding='utf-8')
    # Do not inherit service credentials or load .env.
    keep = {'PATH','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATHEXT','COMSPEC','SYSTEMDRIVE'}
    for key in list(os.environ):
        if key.upper() not in keep: os.environ.pop(key,None)
    os.environ.update(DISABLE_SSL_VERIFY='false',JWT_SECRET_KEY='synthetic-jwt',FLASK_SECRET_KEY='synthetic-flask')
    sys.path.insert(0,str(api))
    helpers = load('p3_existing_http_helpers',api/'scripts/test_wallet_http.py')
    logging.disable(logging.CRITICAL)
    with tempfile.TemporaryDirectory(prefix='opago-p3-http-') as directory, pytest.MonkeyPatch.context() as patch:
        temp = Path(directory); tls = helpers.certificate(temp)
        facade_server = make_server('127.0.0.1',0,Flask('placeholder'),threaded=True,ssl_context=tls,request_handler=helpers.QuietHandler)
        audience = f'https://{helpers.HOST}:{facade_server.server_port}'
        import requests
        real_request = requests.request
        contracts = load('p3_existing_api_fixture',api/'tests/test_wallet_v2.py')
        contracts.AUDIENCE = audience
        ctx = contracts.ctx.__wrapped__(temp,patch)
        facade_server.app = ctx.app
        state = {'match':None,'outcomes':{},'effects':0}; lock = threading.Lock()
        internal = Flask('p3-synthetic-internal')
        def error(code,status=409): return jsonify(contracts.error(code)),status
        @internal.post('/_test/status')
        def status():
            with lock:
                m = state['match']; new = request.get_json()['status']
                if not m: return error('not_found',404)
                m['status'] = new; m['processing_status'] = 'completed'; m['match_result'] = 'passed' if new == 'approved' else 'mismatch'
                m['correction_fields'] = ['given_name','front'] if new == 'correction_requested' else []
                if new == 'approved': m['active_approval_revision'] = m['revision']
                m['updated_at'] = contracts.stamp(); return jsonify(status='ok')
        @internal.route('/api/onboarding/kyc',methods=['POST'])
        @internal.route('/api/onboarding/kyc/<sid>',methods=['GET','PUT','DELETE'])
        @internal.route('/api/onboarding/kyc/<sid>/<action>',methods=['POST'])
        def business(sid=None,action=None):
            with lock:
                if request.headers.get('Authorization') != 'Bearer synthetic-service': return error('forbidden',403)
                user = request.headers.get('X-Opago-User-Authorization')
                if user not in ['Bearer synthetic-wallet-valid','Bearer synthetic-account-valid']: return error('session_expired',401)
                if action == 'documents':
                    b = json.loads(base64.urlsafe_b64decode(request.headers['X-Opago-Photo-Descriptor']+'==='))
                    raw = request.get_data()
                    if hashlib.sha256(raw).hexdigest() != b['original_sha256']: return error('document_invalid',422)
                else: b = request.get_json(silent=True) or {}
                key = request.method + request.path + str(request.args) + request.headers.get('Idempotency-Key','')
                fingerprint = json.dumps(b,sort_keys=True)
                if key in state['outcomes']:
                    old = state['outcomes'][key]
                    if old[0] != fingerprint: return error('idempotency_conflict')
                    return jsonify(old[1]),old[2]
                m = state['match']; code = 200
                if sid is None:
                    if m: return error('kyc_state_invalid')
                    m = state['match'] = dict(submission_id=b['submission_id'],revision=1,edit_version=1,status='draft',
                        fields=b['fields'],documents=[],active_approval_revision=None,assurance='photo_data_match_only',match_result=None,
                        processing_status='idle',correction_fields=[],updated_at=contracts.stamp(),contact_verification_required=True)
                    code = 201; output = m
                else:
                    if not m or sid != m['submission_id']: return error('not_found',404)
                    if request.method == 'GET': return jsonify(m)
                    if request.method == 'DELETE':
                        if m['status'] != 'draft': return error('kyc_state_invalid')
                        state['match'] = None; output = {'status':'ok'}
                    else:
                        if b['expected_edit_version'] != m['edit_version']: return error('revision_conflict')
                        if action == 'revisions':
                            if user != 'Bearer synthetic-account-valid' or m['status'] not in ['approved','correction_requested'] or b['base_revision'] != m['revision']: return error('kyc_state_invalid')
                            m['revision'] += 1; m['edit_version'] += 1; m['status'] = 'draft'; m['processing_status'] = 'idle'; m['match_result'] = None
                            for d in m['documents']: d['revision'] = m['revision']
                            output = m; code = 201
                        else:
                            if b['revision'] != m['revision'] or m['status'] != 'draft': return error('kyc_state_invalid')
                            if request.method == 'PUT': m['fields'] = b['fields']; m['edit_version'] += 1; output = m
                            elif action == 'documents':
                                m['edit_version'] += 1
                                d = dict(document_id=str(uuid4()),side=b['side'],revision=b['revision'],original_sha256=b['original_sha256'],stored_sha256=b['original_sha256'],received_at=contracts.stamp())
                                m['documents'] = [p for p in m['documents'] if p['side'] != b['side']] + [d]
                                output = {k:v for k,v in d.items() if k != 'received_at'}; output.update(submission_id=sid,edit_version=m['edit_version']); code = 201
                            elif action == 'submit':
                                sides = ['front'] if m['fields']['document_type'] == 'passport' else ['front','back']
                                if not all(any(d['side']==side for d in m['documents']) for side in sides): return error('document_invalid',422)
                                m['status'] = 'submitted'; m['processing_status'] = 'queued'; output = m; code = 202
                            else: return error('not_found',404)
                if m: m['updated_at'] = contracts.stamp()
                state['effects'] += 1; output = copy.deepcopy(output); state['outcomes'][key] = (fingerprint,output,code)
                return jsonify(output),code
        internal_server = make_server('127.0.0.1',0,internal,threaded=True,ssl_context=tls,request_handler=helpers.QuietHandler)
        internal_origin = f'https://127.0.0.1:{internal_server.server_port}'
        patch.setenv('API_INTERNAL_URL',internal_origin); patch.setenv('REQUESTS_CA_BUNDLE',tls[0]); patch.setenv('NO_PROXY','*')
        def local_request(method,url,**kwargs):
            if not str(url).startswith(internal_origin+'/'): raise RuntimeError('External network blocked')
            return real_request(method,url,**kwargs)
        patch.setattr(contracts.facade.requests,'request',local_request)
        configuration = {'audience':audience,'internal':internal_origin,'ca':tls[0],'roots':{'test-root':contracts.b64url(contracts.ROOT.public_key().public_bytes_raw())},
            'oidc':{'issuer':ctx.config['oidc']['issuer'],'clientId':ctx.config['oidc']['client_id'],'redirectUri':'opago://callback'}}
        config_file = temp/'client.json'; config_file.write_text(json.dumps(configuration),encoding='utf-8')
        servers = [internal_server,facade_server]; threads = [threading.Thread(target=s.serve_forever,daemon=True) for s in servers]
        for worker in threads: worker.start()
        try:
            result = subprocess.run(['node',str(ROOT/'scripts/p3-http-client.cjs'),str(config_file)],cwd=ROOT,capture_output=True,text=True,encoding='utf-8',timeout=90)
            output = result.stdout+result.stderr
            if any(value in output for value in ['synthetic-wallet-valid','synthetic-account-valid','synthetic@example.test','TEST123']):
                print('Unsafe fixture output suppressed',file=sys.stderr); return 1
            print(result.stdout); print(result.stderr,file=sys.stderr)
            evidence = {'wallet_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
                'wallet_tracked_dirty':bool(subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=ROOT,text=True).strip()),
                'api_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=api,text=True).strip(),'exit_code':result.returncode,
                'contract':'0.2.0','effects':state['effects'],'python':sys.version.split()[0],'node':subprocess.check_output(['node','--version'],text=True).strip(),
                'limits':'Actual public blueprint/HPKE/forwarding and real TLS; synthetic internal decisions/service bearer/Redis/native sockets. No real OIDC, camera, filesystem or device.'}
            args.result.parent.mkdir(parents=True,exist_ok=True); args.result.write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
            return result.returncode
        finally:
            for server in servers: server.shutdown(); server.server_close()
            for worker in threads: worker.join(3)

if __name__ == '__main__': raise SystemExit(main())
