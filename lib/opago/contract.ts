import definitions from '../../docs/lnurl-spark-contracts/v2/schemas.json';
import publicApi from '../../docs/lnurl-spark-contracts/v2/openapi-public.json';
import paymentDefinitions from '../../docs/payment-registration/v0.2.1/schemas.json';

export type Schema = { $ref?: string; const?: unknown; enum?: unknown[]; oneOf?: Schema[]; anyOf?: Schema[];
  allOf?: Schema[]; not?: Schema; if?: Schema; then?: Schema; else?: Schema; prefixItems?: Schema[]; uniqueItems?: boolean;
  type?: string; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: boolean;
  items?: Schema; maxItems?: number; minItems?: number; minLength?: number; maxLength?: number; pattern?: string;
  minimum?: number; maximum?: number; multipleOf?: number; format?: string };
const defs = definitions.$defs as unknown as Record<string, Schema>;
export function matchesSchema(s: Schema, value: unknown, definitions: Record<string, Schema> = defs): boolean {
  const match = (schema: Schema, input: unknown) => matchesSchema(schema, input, definitions);
  if (s.not && match(s.not, value)) return false;
  if (s.allOf && !s.allOf.every(v => match(v, value))) return false;
  if (s.if && !match(match(s.if, value) ? s.then || {} : s.else || {}, value)) return false;
  if (s.$ref) { const ref = definitions[s.$ref.split('/').at(-1)!]; return !!ref && match(ref, value); }
  if (s.oneOf) return s.oneOf.filter(v => match(v, value)).length === 1;
  if (s.anyOf) return s.anyOf.some(v => match(v, value));
  if ('const' in s && value !== s.const) return false;
  if (s.enum && !s.enum.includes(value)) return false;
  if (s.type === 'null') return value === null;
  if (s.type === 'boolean') return typeof value === 'boolean';
  if (s.type === 'integer' || s.type === 'number') return typeof value === 'number' && Number.isSafeInteger(value) &&
    (s.minimum === undefined || value >= s.minimum) && (s.maximum === undefined || value <= s.maximum) &&
    (!s.multipleOf || value % s.multipleOf === 0);
  if (s.type === 'string' || typeof value === 'string' && (s.pattern || s.minLength !== undefined || s.maxLength !== undefined || s.format)) return typeof value === 'string' &&
    (s.minLength === undefined || value.length >= s.minLength) && (s.maxLength === undefined || value.length <= s.maxLength) &&
    (!s.pattern || new RegExp(s.pattern).test(value)) &&
    (s.format !== 'uuid' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) &&
    (s.format !== 'date-time' || Number.isFinite(Date.parse(value)) && new Date(value).toISOString().replace('.000Z', 'Z') === value) &&
    (s.format !== 'date' || /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) &&
    (s.format !== 'uri' || (() => { try { return !!new URL(value).protocol; } catch { return false; } })());
  if (s.type === 'array') return Array.isArray(value) && (s.maxItems === undefined || value.length <= s.maxItems) &&
    (s.minItems === undefined || value.length >= s.minItems) && (!s.uniqueItems || new Set(value.map(v => JSON.stringify(v))).size === value.length) &&
    value.every((v,i) => match(s.prefixItems?.[i] || s.items || {}, v));
  if (s.type === 'object' || s.properties || s.required) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return s.type !== 'object';
    const obj = value as Record<string, unknown>;
    return (s.required || []).every(k => Object.hasOwn(obj, k)) && Object.entries(obj).every(([k,v]) =>
      s.properties?.[k] ? match(s.properties[k], v) : s.additionalProperties !== false);
  }
  return true;
}
export function assertContract<T>(name: string, value: unknown): asserts value is T {
  const payment = name.startsWith('payment-0.2.1:');
  const schemas = payment ? paymentDefinitions.$defs as unknown as Record<string, Schema> : defs;
  const key = payment ? name.slice('payment-0.2.1:'.length) : name;
  if (!schemas[key] || !matchesSchema(schemas[key], value, schemas)) throw new Error('Invalid OPAGO contract response: ' + name);
}
export function routeContract(method: string, path: string): { request: string; response: string; status: number } {
  path = path.split('?')[0];
  const paths = publicApi.paths as unknown as Record<string, Record<string, { 'x-opago-plaintext-request'?: { $ref: string };
    'x-opago-plaintext-response'?: { $ref: string }; responses: Record<string, unknown> }>>;
  const template = Object.keys(paths).find(p => new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(path));
  const op = template && paths[template][method.toLowerCase()];
  if (!op || !op['x-opago-plaintext-request'] || !op['x-opago-plaintext-response']) throw new Error('Unsupported wallet contract route.');
  const prefix = template?.startsWith('/api/v2/payments/registrations') ? 'payment-0.2.1:' : '';
  return { request: prefix + op['x-opago-plaintext-request'].$ref.split('/').at(-1)!,
    response: prefix + op['x-opago-plaintext-response'].$ref.split('/').at(-1)!,
    status: Number(Object.keys(op.responses).find(k => /^2\d\d$/.test(k))) };
}
export function routeQueryParameters(method: string, path: string): { name: string; required?: boolean; schema: Schema }[] {
  const paths = publicApi.paths as unknown as Record<string, Record<string, { parameters?: { name: string; in: string; required?: boolean; schema: Schema }[] }>>;
  const template = Object.keys(paths).find(p => new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(path));
  return (template && paths[template][method.toLowerCase()]?.parameters || []).filter(p => p.in === 'query');
}
