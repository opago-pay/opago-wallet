import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { randomUUID } from 'expo-crypto';
import type { PrivateStore } from './store';
import { encodeBase64url, decodeBase64url } from './peer-native';
const indexKey = 'opago.f3.secure.index.v1';
const options = { keychainService: 'opago.f3.v1', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
type Pointer = { version: string; count: number; hash: string };
function chunkKeys(key: string, p: Pointer): string[] {
  if (!/^[0-9a-f-]{36}$/.test(p.version) || !Number.isSafeInteger(p.count) || p.count < 1 || p.count > 2048) throw new Error('Invalid private storage pointer.');
  return Array.from({ length: p.count }, (_, i) => key + '.' + p.version + '.' + i);
}
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(run: () => Promise<T>): Promise<T> {
  const work = queue.catch(() => undefined).then(run); queue = work; return work;
}
const keyFor = (value: string) => 'f3.' + bytesToHex(sha256(utf8ToBytes(value)));
async function index(): Promise<string[]> { const v = await AsyncStorage.getItem(indexKey); return v ? JSON.parse(v) : []; }
async function addKeys(keys: string[]) { await AsyncStorage.setItem(indexKey, JSON.stringify([...new Set([...(await index()), ...keys])])); }
async function removeKeys(keys: string[]) {
  for (const key of keys) await SecureStore.deleteItemAsync(key, options);
  await AsyncStorage.setItem(indexKey, JSON.stringify((await index()).filter(k => !keys.includes(k))));
}
export const f3PrivateStore: PrivateStore = {
  read<T>(key: string) { return serial(async () => {
    if (Platform.OS === 'web') throw new Error('OPAGO account storage requires a native device.');
    const raw = await SecureStore.getItemAsync(keyFor(key), options); if (!raw) return null;
    const pointer = JSON.parse(raw) as Pointer;
    const pieces = await Promise.all(chunkKeys(keyFor(key), pointer).map(k => SecureStore.getItemAsync(k, options)));
    if (pieces.some(p => p === null)) throw new Error('OPAGO account recovery is incomplete.');
    const bytes = decodeBase64url(pieces.join(''));
    if (bytesToHex(sha256(bytes)) !== pointer.hash) throw new Error('OPAGO account recovery data is invalid.');
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  }); },
  write(key: string, value: unknown) { return serial(async () => {
    if (Platform.OS === 'web') throw new Error('OPAGO account storage requires a native device.');
    const pointerKey = keyFor(key);
    const old = await SecureStore.getItemAsync(pointerKey, options);
    const bytes = utf8ToBytes(JSON.stringify(value)); const encoded = encodeBase64url(bytes);
    const pointer: Pointer = { version: randomUUID(), count: Math.ceil(encoded.length / 1500), hash: bytesToHex(sha256(bytes)) };
    const keys = chunkKeys(pointerKey, pointer);
    // Index only opaque storage keys before writes, so wipe also removes interrupted chunks.
    await addKeys([pointerKey, ...keys]);
    for (let i = 0; i < keys.length; i++) await SecureStore.setItemAsync(keys[i], encoded.slice(i * 1500, (i + 1) * 1500), options);
    await SecureStore.setItemAsync(pointerKey, JSON.stringify(pointer), options);
    if (old) await removeKeys(chunkKeys(pointerKey, JSON.parse(old) as Pointer));
  }); },
  remove(key: string) { return serial(async () => {
    const pointerKey = keyFor(key); const raw = await SecureStore.getItemAsync(pointerKey, options);
    await removeKeys([pointerKey, ...(raw ? chunkKeys(pointerKey, JSON.parse(raw) as Pointer) : [])]);
  }); },
};
export function clearF3PrivateStore() { return serial(async () => {
  await removeKeys(await index()); await AsyncStorage.removeItem(indexKey);
}); }
