import * as Picker from 'expo-image-picker';
import * as Files from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { randomUUID } from 'expo-crypto';
import { Buffer } from 'buffer';
import { inspectPhoto, inspectHeic, stripJpegMetadata, PHOTO_BYTES } from './identity-media';
import type { IdentityPhoto } from './identity';

const root = () => { if (!Files.cacheDirectory) throw new Error('identity_private_cache'); return Files.cacheDirectory + 'opago-p3/'; };
/** Owned cache paths only. Never delete a user's photo-library original. */
function owned(uri: string) { return !!Files.cacheDirectory && uri.startsWith(Files.cacheDirectory) && !uri.includes('/../') && !uri.includes('%'); }
async function remove(uri: string) { if (owned(uri)) await Files.deleteAsync(uri,{ idempotent: true }); }
export async function cleanupIdentityPhotos() {
  // Recover picker/manipulator copies abandoned by a prior process, in their dedicated module caches.
  for (const dir of [root(), Files.cacheDirectory + 'ImagePicker/', Files.cacheDirectory + 'ImageManipulator/']) await remove(dir);
}
export async function removeIdentityPhoto(photo: IdentityPhoto) { photo.bytes.fill(0); await remove(photo.uri); }
export async function selectIdentityPhoto(source: 'camera' | 'library', side: IdentityPhoto['side'], assertCurrent: () => void): Promise<IdentityPhoto | null> {
  assertCurrent();
  if (source === 'camera') {
    const permission = await Picker.requestCameraPermissionsAsync(); assertCurrent();
    if (!permission.granted) throw new Error('identity_camera_denied');
  }
  const options: Picker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: false, quality: 1, exif: false, base64: false,
    preferredAssetRepresentationMode: Picker.UIImagePickerPreferredAssetRepresentationMode.Compatible };
  const result = source === 'camera' ? await Picker.launchCameraAsync(options) : await Picker.launchImageLibraryAsync(options);
  if (result.canceled) { assertCurrent(); return null; }
  const asset = result.assets[0]; let normalized: string | undefined; let preview: string | undefined; let bytes: Uint8Array | undefined;
  let original: Buffer | undefined; let encoded: Buffer | undefined;
  try {
    assertCurrent();
    if (!owned(asset.uri) || result.assets.length !== 1 || asset.type !== 'image') throw new Error('identity_image_format');
    const info = await Files.getInfoAsync(asset.uri); assertCurrent();
    if (!info.exists || info.isDirectory || !info.size || info.size > PHOTO_BYTES) throw new Error('identity_image_size');
    original = Buffer.from(await Files.readAsStringAsync(asset.uri,{ encoding: Files.EncodingType.Base64 }), 'base64');
    assertCurrent();
    let sourceInfo: { width: number; height: number };
    try { sourceInfo = inspectPhoto(original); }
    catch (cause) { if (String.fromCharCode(...original.slice(4,8)) !== 'ftyp') throw cause; sourceInfo = inspectHeic(original); }
    finally { original.fill(0); }
    if (Math.min(asset.width,asset.height) < 480 || Math.max(asset.width,asset.height) > 10000 || asset.width*asset.height > 24000000) throw new Error('identity_image_invalid');
    // Native decoder applies EXIF orientation before saving, without cropping/downscaling.
    const image = await manipulateAsync(asset.uri,[],{ compress: 1, format: SaveFormat.JPEG, base64: false }); normalized = image.uri;
    assertCurrent();
    const nextInfo = await Files.getInfoAsync(image.uri); assertCurrent();
    if (!nextInfo.exists || nextInfo.isDirectory || nextInfo.size > PHOTO_BYTES) throw new Error('identity_image_size');
    encoded = Buffer.from(await Files.readAsStringAsync(image.uri,{ encoding: Files.EncodingType.Base64 }),'base64');
    assertCurrent(); bytes = stripJpegMetadata(encoded); encoded.fill(0);
    const checked = inspectPhoto(bytes);
    if (checked.width !== image.width || checked.height !== image.height) throw new Error('identity_image_invalid');
    if (!(checked.width === sourceInfo.width && checked.height === sourceInfo.height || checked.width === sourceInfo.height && checked.height === sourceInfo.width)) throw new Error('identity_image_invalid');
    await Files.makeDirectoryAsync(root(),{ intermediates: true }); assertCurrent();
    preview = root() + randomUUID() + '.jpg';
    await Files.writeAsStringAsync(preview,Buffer.from(bytes).toString('base64'),{ encoding: Files.EncodingType.Base64 }); assertCurrent();
    return { bytes, uri: preview, side };
  } catch (cause) { bytes?.fill(0); if (preview) await remove(preview); throw cause; }
  finally { original?.fill(0); encoded?.fill(0); await remove(asset.uri); if (normalized) await remove(normalized); }
}
