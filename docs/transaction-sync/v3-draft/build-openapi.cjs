'use strict';

const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const schemaRef = name => `./api-messages.schema.json#/definitions/${name}`;
const hpkeRef = name => `../../lnurl-spark-contracts/v2/schemas.json#/$defs/${name}`;
const uuid = { type: 'string', format: 'uuid' };

const routes = [
  { method: 'post', path: '/api/v3/wallet/observations', operationId: 'ingestV3Observations', auth: 'account',
    request: './observations.schema.json', response: schemaRef('IngestResult'), large: true },
  { method: 'get', path: '/api/v3/wallet/observations/cursor', operationId: 'getV3Cursor', auth: 'account',
    response: schemaRef('Cursor'), query: ['installation_id'] },
  { method: 'get', path: '/api/v3/wallet/observations/batches/{idempotency_key}', operationId: 'getV3Batch', auth: 'account',
    response: schemaRef('IngestResult'), query: ['installation_id'], params: ['idempotency_key'] },
  { method: 'post', path: '/api/v3/wallet/observations/close-rejected', operationId: 'closeV3Rejected', auth: 'account',
    request: schemaRef('CloseRejectedRequest'), response: schemaRef('Cursor') },
  { method: 'post', path: '/api/v3/hedera/binding-challenges', operationId: 'createHederaBindingChallenge', auth: 'account_fresh',
    request: schemaRef('HederaChallengeRequest'), response: schemaRef('HederaChallenge') },
  { method: 'post', path: '/api/v3/hedera/bindings', operationId: 'bindHederaAccount', auth: 'account',
    request: schemaRef('HederaBindRequest'), response: schemaRef('HederaBinding') },
  { method: 'get', path: '/api/v3/hedera/bindings/{wallet_id}', operationId: 'getHederaBinding', auth: 'account',
    response: schemaRef('HederaBinding'), params: ['wallet_id'] },
  { method: 'post', path: '/api/v3/hedera/bindings/{wallet_id}/deactivate', operationId: 'deactivateHederaBinding', auth: 'account_fresh',
    request: schemaRef('HederaDeactivateRequest'), response: schemaRef('HederaBinding'), params: ['wallet_id'] },
  { method: 'put', path: '/api/v3/wallet/observation-migrations/{migration_id}', operationId: 'putObservationMigration', auth: 'account',
    request: schemaRef('MigrationRequest'), response: schemaRef('MigrationStatus'), params: ['migration_id'] },
  { method: 'get', path: '/api/v3/wallet/observation-migrations/{migration_id}', operationId: 'getObservationMigration', auth: 'account',
    response: schemaRef('MigrationStatus'), params: ['migration_id'] },
  { method: 'post', path: '/api/v3/wallet/observation-migrations/{migration_id}/activate', operationId: 'activateObservationMigration', auth: 'account',
    request: schemaRef('Empty'), response: schemaRef('MigrationStatus'), params: ['migration_id'] },
];

function param(name, where) {
  return { name, in: where, required: true, schema: uuid };
}

function makeOperation(route, surface) {
  const publicApi = surface === 'public';
  const parameters = [
    ...(route.params || []).map(name => param(name, 'path')),
    ...(route.query || []).map(name => param(name, 'query')),
    { name: 'X-Opago-App-Build', in: 'header', required: true,
      schema: { type: 'integer', minimum: 1, maximum: 9007199254740991 } },
    { name: 'X-Opago-Platform', in: 'header', required: true,
      schema: { type: 'string', enum: ['ios', 'android'] } },
  ];
  if (route.method !== 'get') parameters.push(param('Idempotency-Key', 'header'));
  if (publicApi && route.method === 'get') parameters.push({ name: 'X-Opago-Envelope', in: 'header', required: true,
    schema: { type: 'string', minLength: 1, maxLength: 16384 } });
  if (!publicApi) parameters.push({ name: 'X-Opago-User-Authorization', in: 'header', required: true,
    schema: { type: 'string', pattern: '^Bearer [^\\s]+$', maxLength: 8192 } });

  const op = {
    operationId: route.operationId,
    summary: route.operationId,
    security: [{ [publicApi ? 'AccountBearer' : 'ServiceBearer']: [] }],
    'x-opago-auth-policy': route.auth,
    ...(!publicApi ? { 'x-opago-end-user-policy': route.auth } : {}),
    'x-opago-transport': publicApi ? 'hpke' : 'json',
    'x-opago-max-plaintext-bytes': route.large ? 524288 : 65536,
    parameters,
    responses: {
      200: { description: 'Durable result; accepted observation is not settlement proof.',
        headers: { 'X-Request-Id': { schema: uuid }, 'Cache-Control': { schema: { const: 'no-store' } } },
        content: { 'application/json': { schema: { $ref: publicApi ? hpkeRef('HpkeResponse') : route.response } } },
        ...(publicApi ? { 'x-opago-plaintext-schema': { $ref: route.response } } : {}) },
      default: { description: 'Business status/code preserved; after valid HPKE envelope the error is encrypted.',
        content: { 'application/json': { schema: publicApi
          ? { oneOf: [{ $ref: hpkeRef('HpkeResponse') }, { $ref: schemaRef('Error') }] }
          : { $ref: schemaRef('Error') } } } },
    },
  };
  if (route.method !== 'get') {
    op.requestBody = { required: true, content: { 'application/json': {
      schema: { $ref: publicApi ? hpkeRef('HpkeRequest') : route.request },
    } }, ...(publicApi ? { 'x-opago-plaintext-schema': { $ref: route.request } } : {}) };
  }
  return op;
}

function build(surface) {
  const paths = {};
  for (const route of routes) {
    paths[route.path] ||= {};
    paths[route.path][route.method] = makeOperation(route, surface);
  }
  return {
    openapi: '3.1.0',
    info: { title: `OPAGO multi-asset transaction sync v3 ${surface} DRAFT`, version: '0.3.0-draft.1',
      description: 'Normative behavior: PROTOCOL-V3.md and MIGRATION.md. Not yet deployed or jointly approved.' },
    servers: [{ url: surface === 'public' ? 'https://api.opago.com' : 'https://opago-internal.invalid' }],
    paths,
    components: { securitySchemes: surface === 'public'
      ? { AccountBearer: { type: 'http', scheme: 'bearer', description: 'Verified Keycloak account access token.' } }
      : { ServiceBearer: { type: 'http', scheme: 'bearer', description: 'Authorized API-facade service token; independently verify forwarded user bearer.' } } },
  };
}

if (require.main === module) {
  for (const surface of ['public', 'internal']) {
    const file = path.join(here, `openapi-${surface}.json`);
    fs.writeFileSync(file, JSON.stringify(build(surface), null, 2) + '\n');
  }
}
module.exports = { routes, build };
