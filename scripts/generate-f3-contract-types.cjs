'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const schemas = require('../docs/lnurl-spark-contracts/v2/schemas.json').$defs;
function type(s) {
  if (!s) return 'unknown';
  if (s.$ref) return s.$ref.split('/').at(-1);
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(v => JSON.stringify(v)).join(' | ');
  if (s.oneOf || s.anyOf) return (s.oneOf || s.anyOf).map(type).join(' | ');
  if (s.type === 'array') return s.prefixItems ? `[${s.prefixItems.map(type).join(', ')}]` : `(${type(s.items)})[]`;
  if (s.type === 'object' && !Object.keys(s.properties || {}).length) return s.additionalProperties ? 'Record<string, unknown>' : 'Record<string, never>';
  if (s.type === 'object') return '{ ' + Object.entries(s.properties || {}).map(([k,v]) =>
    `${JSON.stringify(k)}${s.required?.includes(k) ? '' : '?'}: ${type(v)}`).join('; ') + ' }';
  return ({ integer: 'number', number: 'number', string: 'string', boolean: 'boolean', null: 'null' })[s.type] || 'unknown';
}
fs.mkdirSync(path.join(root, 'lib/opago'), { recursive: true });
fs.writeFileSync(path.join(root, 'lib/opago/contract-types.ts'), '// Generated from contract 0.2.0. Run node scripts/generate-f3-contract-types.cjs.\n' +
  Object.entries(schemas).map(([name,s]) => `export type ${name} = ${type(s)};`).join('\n') + '\n');
