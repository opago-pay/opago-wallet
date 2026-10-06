/** Pure QR reference validation. Keep schema/HKA/account loading out of the
 * existing payment scanner until the user opens a POS review. */
export type PosLinkReference = { pos_id: string; binding_intent_id: string };
export function isValidPosLinkReference(value: unknown): value is PosLinkReference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const ref = value as Record<string, unknown>;
  return Object.keys(ref).sort().join(',') === 'binding_intent_id,pos_id' && typeof ref.pos_id === 'string' &&
    /^pos-[a-z2-7]{10}$/.test(ref.pos_id) && typeof ref.binding_intent_id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.binding_intent_id);
}
