/** RFC 8785 serialization. Reject duplicate properties and invalid Unicode before signing. */
export function validUnicode(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) { const next = s.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
export function jcs(value: unknown, depth = 0): string {
  if (depth > 32) throw new Error('JSON nesting exceeds limit.');
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === 'string' && validUnicode(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(v => jcs(v, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    return '{' + Object.keys(value).sort().map(k => jcs(k, depth + 1) + ':' + jcs((value as Record<string, unknown>)[k], depth + 1)).join(',') + '}';
  }
  throw new Error('Invalid JSON value.');
}
export function parseStrictJson(raw: string): unknown {
  let i = 0;
  function ws() { while (/[\x20\x09\x0a\x0d]/.test(raw[i] || '\0')) i++; }
  function string(): string {
    const start = i++;
    while (i < raw.length) { const c = raw[i++]; if (c === '\\') i++; else if (c === '"') {
      const value: string = JSON.parse(raw.slice(start, i)); if (!validUnicode(value)) throw new Error('Invalid JSON Unicode.'); return value;
    } }
    throw new Error('Invalid JSON string.');
  }
  function value(depth: number): unknown {
    if (depth > 32) throw new Error('JSON nesting exceeds limit.'); ws();
    if (raw[i] === '"') return string();
    if (raw[i] === '{') {
      i++; ws(); const obj: Record<string, unknown> = {}; const keys = new Set<string>();
      if (raw[i] === '}') { i++; return obj; }
      while (i < raw.length) {
        ws(); if (raw[i] !== '"') break; const key = string();
        if (keys.has(key)) throw new Error('Duplicate JSON property.'); keys.add(key);
        ws(); if (raw[i++] !== ':') break;
        Object.defineProperty(obj, key, { value: value(depth + 1), enumerable: true, writable: true, configurable: true });
        ws(); const c = raw[i++]; if (c === '}') return obj; if (c !== ',') break;
      }
      throw new Error('Invalid JSON object.');
    }
    if (raw[i] === '[') {
      i++; ws(); const arr: unknown[] = []; if (raw[i] === ']') { i++; return arr; }
      while (i < raw.length) { arr.push(value(depth + 1)); ws(); const c = raw[i++]; if (c === ']') return arr; if (c !== ',') break; }
      throw new Error('Invalid JSON array.');
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(i));
    if (!token) throw new Error('Invalid JSON token.'); i += token[0].length;
    const parsed: unknown = JSON.parse(token[0]);
    if (typeof parsed === 'number' && (!Number.isFinite(parsed) || Number.isInteger(parsed) && !Number.isSafeInteger(parsed))) throw new Error('Invalid JSON number.');
    return parsed;
  }
  const result = value(0); ws(); if (i !== raw.length) throw new Error('Trailing JSON data.'); return result;
}
export function utf8(value: string): Uint8Array {
  if (!validUnicode(value)) throw new Error('Invalid Unicode.'); return new TextEncoder().encode(value);
}
export function strictUtf8(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes); const encoded = utf8(text);
  if (encoded.length !== bytes.length || encoded.some((b, i) => b !== bytes[i])) throw new Error('Invalid UTF-8 bytes.'); return text;
}
export function base64url(bytes: Uint8Array): string {
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unbase64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url.');
  const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Error('Noncanonical base64url.'); return bytes;
}
