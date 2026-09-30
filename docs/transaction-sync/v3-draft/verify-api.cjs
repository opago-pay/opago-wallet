'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const { PrivateKey, PublicKey } = require('@hiero-ledger/sdk');
const schema = require('./api-messages.schema.json');
const vector = require('./hedera-bind-vector.json');
const { build, routes } = require('./build-openapi.cjs');

const ajv = new Ajv({ allErrors: true });
ajv.addSchema(schema);
const validate = name => ajv.compile({ $ref: `${schema.$id}#/definitions/${name}` });
const uuid = suffix => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const messageBytes = Buffer.from(vector.message, 'utf8');
const signatureBytes = Buffer.from(vector.signature_b64u, 'base64url');
const testKey = PrivateKey.fromBytesED25519(Uint8Array.from(Buffer.from(vector.test_private_seed_hex, 'hex')));
const publicKey = PublicKey.fromStringED25519(vector.public_key);

assert.equal(testKey.publicKey.toStringRaw().toLowerCase(), vector.public_key);
assert.equal(Buffer.from(testKey.sign(messageBytes)).toString('base64url'), vector.signature_b64u);
assert.equal(signatureBytes.length, 64);
assert.equal(publicKey.verify(messageBytes, signatureBytes), true);
assert.equal(publicKey.verify(Buffer.from(vector.message.replace('hedera:testnet', 'hedera:mainnet')), signatureBytes), false);
assert.equal(publicKey.verify(Buffer.from(vector.message + '\n'), signatureBytes), false);

const challengeRequest = {
  installation_id: uuid(401), network_id: 'hedera:testnet',
  hedera_account_id: '0.0.1234', public_key: vector.public_key,
};
const challenge = {
  challenge_id: uuid(501), signing_message_b64u: messageBytes.toString('base64url'),
  issued_at: '2026-09-29T12:00:00Z', expires_at: '2026-09-29T12:05:00Z',
};
const bindRequest = {
  challenge_id: uuid(501), installation_id: uuid(401), signature_b64u: vector.signature_b64u,
};
const binding = {
  wallet_id: uuid(601), network_id: 'hedera:testnet', hedera_account_id: '0.0.1234',
  public_key: vector.public_key, binding_generation: 1, status: 'active',
  verified_at: '2026-09-29T12:02:00Z',
};
const accepted = {
  installation_id: uuid(401),
  results: [{ client_event_id: uuid(701), seq: 1, result: 'accepted',
    movement_id: uuid(801), code: null, closure_token: null }],
  last_acknowledged_seq: 1, missing_seq: [], missing_seq_truncated: false,
};
const migration = {
  legacy_wallet_id: uuid(901), legacy_installation_id: uuid(902),
  legacy_last_allocated_seq: 42, v3_installation_id: uuid(401),
  catalog_version: '0.3.0-draft.1', source_anchors: [],
};
const migrationStatus = {
  migration_id: uuid(903), phase: 'draining', legacy_last_allocated_seq: 42,
  v2_last_acknowledged_seq: 41, v3_last_acknowledged_seq: 0,
  backfill_through_seq: 0, blockers: ['cursor_gap'],
};
const samples = { HederaChallengeRequest: challengeRequest, HederaChallenge: challenge,
  HederaBindRequest: bindRequest, HederaBinding: binding, IngestResult: accepted,
  Cursor: { installation_id: uuid(401), last_acknowledged_seq: 1,
    missing_seq: [], missing_seq_truncated: false },
  CloseRejectedRequest: { installation_id: uuid(401), items: [{ seq: 2,
    client_event_id: uuid(702), closure_token: 'opaque-test-token' }] },
  HederaDeactivateRequest: { expected_binding_generation: 1, reason: 'lost_key' },
  MigrationRequest: migration, MigrationStatus: migrationStatus,
  Error: { error: { code: 'binding_stale', message: 'Binding needs renewal.',
    retryable: false, details: {} } },
};
for (const [name, value] of Object.entries(samples)) {
  const check = validate(name);
  assert.equal(check(value), true, `${name}: ${ajv.errorsText(check.errors)}`);
}
const invalid = structuredClone(challengeRequest);
invalid.network_id = 'bitcoin:mainnet';
assert.equal(validate('HederaChallengeRequest')(invalid), false);
const invalidSeq = structuredClone(accepted);
invalidSeq.results[0].seq = 0;
assert.equal(validate('IngestResult')(invalidSeq), false);
const invalidSignature = structuredClone(bindRequest);
invalidSignature.signature_b64u += '=';
assert.equal(validate('HederaBindRequest')(invalidSignature), false);

function resolveReferences(value, sourceFile) {
  if (Array.isArray(value)) return value.forEach(item => resolveReferences(item, sourceFile));
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key !== '$ref') { resolveReferences(child, sourceFile); continue; }
    const [file, pointer] = child.split('#');
    const targetFile = path.resolve(path.dirname(sourceFile), file || path.basename(sourceFile));
    let target = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    for (const raw of (pointer || '').split('/').slice(1)) {
      target = target[raw.replace(/~1/g, '/').replace(/~0/g, '~')];
      assert.notEqual(target, undefined, `unresolved ${child} from ${sourceFile}`);
    }
  }
}
for (const surface of ['public', 'internal']) {
  const file = path.join(__dirname, `openapi-${surface}.json`);
  const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(actual, build(surface), `${surface} OpenAPI was not regenerated`);
  resolveReferences(actual, file);
  assert.equal(Object.values(actual.paths).reduce((n, item) => n + Object.keys(item).length, 0), routes.length);
  for (const route of routes) {
    const op = actual.paths[route.path][route.method];
    assert.equal(op.operationId, route.operationId);
    assert.equal(op['x-opago-auth-policy'], route.auth);
    const expectedParams = [...(route.params || [])].sort();
    const actualParams = op.parameters.filter(item => item.in === 'path').map(item => item.name).sort();
    assert.deepEqual(actualParams, expectedParams);
    assert.equal(op.parameters.some(item => item.name === 'Idempotency-Key'), route.method !== 'get');
    if (surface === 'internal') {
      assert.equal(op['x-opago-end-user-policy'], route.auth);
      assert.deepEqual(op.security, [{ ServiceBearer: [] }]);
    } else assert.deepEqual(op.security, [{ AccountBearer: [] }]);
  }
}

console.log('V3 API messages and Hedera Ed25519 test vector verified.');
