/** Draft adapter-domain model, NOT an agreed REST/HPKE response schema.
 * Keep isolated until the OPAGO API chat publishes the pairing/unlink contract. */
export const PAIRING_ISSUER = 'https://api.opago.com';
export const BINDING_EVIDENCE_YEARS = 5;
export type PairingQr = { version: 1; type: 'opago.payout-wallet-link'; issuer: string; intent_id: string; pairing_code: string; expires_at: string };
export type PairingIntent = { intent_id: string; account_subject: string; binding_version: number; replace: boolean; expires_at: string; status: 'pending' | 'confirmed' | 'expired' | 'cancelled' };
export type PayoutBinding = { account_subject: string; binding_version: number; wallet: null | { id: string; identity_pubkey: string; network: 'mainnet' | 'regtest' }; incoming_enabled: boolean; outgoing_enabled: boolean; evidence_retention_years: 5 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isPairingId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw new Error('invalid_pairing_response');
  return value as Record<string, unknown>;
}
function instant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString().replace('.000Z', 'Z') === value;
}
export function pairingQr(value: unknown, now = Date.now()): PairingQr {
  const v = object(value, ['version','type','issuer','intent_id','pairing_code','expires_at']);
  if (v.version !== 1 || v.type !== 'opago.payout-wallet-link' || v.issuer !== PAIRING_ISSUER || !isPairingId(v.intent_id) ||
      typeof v.pairing_code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(v.pairing_code) || !instant(v.expires_at)) throw new Error('invalid_pairing_code');
  if (Date.parse(v.expires_at) <= now) throw new Error('pairing_expired');
  if (Date.parse(v.expires_at) > now + 300_000) throw new Error('invalid_pairing_code');
  return v as PairingQr;
}
export function pairingIntent(value: unknown): PairingIntent {
  const v = object(value, ['intent_id','account_subject','binding_version','replace','expires_at','status']);
  if (!isPairingId(v.intent_id) || !isPairingId(v.account_subject) || !Number.isSafeInteger(v.binding_version) || Number(v.binding_version) < 0 ||
      typeof v.replace !== 'boolean' || !instant(v.expires_at) || !['pending','confirmed','expired','cancelled'].includes(String(v.status))) throw new Error('invalid_pairing_response');
  return v as PairingIntent;
}
export function payoutBinding(value: unknown, subject?: string): PayoutBinding {
  const v = object(value, ['account_subject','binding_version','wallet','incoming_enabled','outgoing_enabled','evidence_retention_years']);
  if (!isPairingId(v.account_subject) || subject && v.account_subject !== subject || !Number.isSafeInteger(v.binding_version) || Number(v.binding_version) < 0 ||
      typeof v.incoming_enabled !== 'boolean' || typeof v.outgoing_enabled !== 'boolean' || v.evidence_retention_years !== BINDING_EVIDENCE_YEARS) throw new Error('invalid_pairing_response');
  if (v.wallet === null) {
    if (v.incoming_enabled || v.outgoing_enabled) throw new Error('unlinked_payments_enabled');
  } else {
    const w = object(v.wallet, ['id','identity_pubkey','network']);
    if (!isPairingId(w.id) || typeof w.identity_pubkey !== 'string' || !/^(?:0[23])?[0-9a-f]{64}$/.test(w.identity_pubkey) || !['mainnet','regtest'].includes(String(w.network))) throw new Error('invalid_pairing_response');
  }
  return v as PayoutBinding;
}
