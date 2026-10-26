import type { PosLinkSource } from './pos-link';
import { isValidPosLinkReference } from './pos-link-reference';
let source: PosLinkSource | undefined;
/** The live decoder is supplied with the reviewed integration. No assumed URL,
 * arbitrary fetch, synthetic decoder or automatic test fallback. */
export function installPosQrSource(value?: PosLinkSource) {
  if (value && value.mode !== 'backend') throw new Error('Only a live POS QR decoder may be registered.');
  source = value;
}
export function isPosLinkQr(input: string): boolean {
  if (!source || input.length > 4096) return false;
  const ref = source.decodeQr(input); if (!ref) return false;
  if (!isValidPosLinkReference(ref)) throw new Error('Invalid POS linking reference.');
  return true;
}
