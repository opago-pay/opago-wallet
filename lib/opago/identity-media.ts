import { sha256 } from '@noble/hashes/sha256';
export const PHOTO_BYTES = 10 * 1024 * 1024;
export const photoHash = (bytes: Uint8Array) => Array.from(sha256(bytes), b => b.toString(16).padStart(2, '0')).join('');
const invalid = () => new Error('identity_image_invalid');
export type PhotoInfo = { contentType: 'image/jpeg' | 'image/png'; width: number; height: number };
/** HEIC is accepted only as a local decoder input, never as a wire document.
 * Inspect bounded ISO-BMFF spatial extents before decode; unknown/grid extents fail closed. */
export function inspectHeic(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 32 || bytes.length > PHOTO_BYTES || String.fromCharCode(...bytes.slice(4,8)) !== 'ftyp') throw invalid();
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength); const brandEnd = view.getUint32(0);
  if (brandEnd < 16 || brandEnd > Math.min(bytes.length,1024)) throw invalid();
  const brands: string[] = []; for (let i = 8; i+4 <= brandEnd; i+=4) if (i !== 12) brands.push(String.fromCharCode(...bytes.slice(i,i+4)));
  if (!brands.some(b => ['heic','heix','hevc','hevx'].includes(b)) || brands.includes('avif')) throw new Error('identity_image_format');
  let count = 0; const dimensions: { width: number; height: number }[] = [];
  const boxes = (start: number,end: number,depth: number) => {
    if (depth > 8) throw invalid();
    while (start < end) {
      if (++count > 4096 || start+8 > end) throw invalid();
      const size = view.getUint32(start); const kind = String.fromCharCode(...bytes.slice(start+4,start+8));
      if (size < 8 || start+size > end) throw invalid();
      if (kind === 'ispe') {
        if (size !== 20) throw invalid(); const width = view.getUint32(start+12), height = view.getUint32(start+16);
        if (!width || !height || Math.max(width,height) > 10000 || width*height > 24000000) throw invalid();
        dimensions.push({ width,height });
      } else if (['meta','iprp','ipco'].includes(kind)) boxes(start+8+(kind === 'meta' ? 4 : 0),start+size,depth+1);
      start += size;
    }
  };
  boxes(0,bytes.length,0);
  const largest = dimensions.sort((a,b) => b.width*b.height-a.width*a.height)[0];
  if (!largest || Math.min(largest.width,largest.height) < 480) throw invalid(); return largest;
}
/** Bounded header inspection precedes native decode; filename/MIME hints are never trusted. */
export function inspectPhoto(bytes: Uint8Array): PhotoInfo {
  if (!bytes.length || bytes.length > PHOTO_BYTES) throw new Error('identity_image_size');
  let width = 0, height = 0; let contentType: PhotoInfo['contentType'];
  if (bytes.length >= 33 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw invalid();
    width = view.getUint32(16); height = view.getUint32(20); contentType = 'image/png';
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    contentType = 'image/jpeg'; let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) throw invalid();
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++]; if (marker === 218 || marker === 217) break;
      const size = bytes[offset] * 256 + bytes[offset+1];
      if (size < 2 || offset + size > bytes.length) throw invalid();
      if ([192,193,194].includes(marker)) {
        if (size < 8) throw invalid();
        height = bytes[offset+3] * 256 + bytes[offset+4]; width = bytes[offset+5] * 256 + bytes[offset+6]; break;
      }
      offset += size;
    }
  } else throw new Error('identity_image_format');
  if (Math.min(width,height) < 480 || Math.max(width,height) > 10000 || width * height > 24000000) throw invalid();
  return { contentType, width, height };
}
/** Re-encoded JPEG is stripped of all APP/COM metadata, including EXIF/GPS/XMP.
 * Run only after native orientation normalization; stripping original EXIF first would rotate incorrectly. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (inspectPhoto(bytes).contentType !== 'image/jpeg') throw invalid();
  const parts = [bytes.slice(0,2)]; let offset = 2;
  while (offset + 4 <= bytes.length) {
    const start = offset; if (bytes[offset++] !== 255) throw invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 218) { parts.push(bytes.slice(start)); offset = bytes.length; break; }
    if (marker === 217) throw invalid();
    const size = bytes[offset] * 256 + bytes[offset+1]; if (size < 2 || offset + size > bytes.length) throw invalid();
    offset += size; if (!(marker >= 224 && marker <= 239 || marker === 254)) parts.push(bytes.slice(start,offset));
  }
  if (offset !== bytes.length || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) throw invalid();
  const clean = new Uint8Array(parts.reduce((n,p) => n+p.length,0)); let cursor = 0;
  for (const p of parts) { clean.set(p,cursor); cursor += p.length; }
  inspectPhoto(clean); return clean;
}
