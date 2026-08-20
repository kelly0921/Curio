import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1_800;
const memoryFallback = new Map<string, string>();

function webStorage(): Storage | null {
  return typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;
}

async function secureStoreAvailable(): Promise<boolean> {
  return Platform.OS !== 'web' && await SecureStore.isAvailableAsync();
}

async function removeNativeValue(key: string): Promise<void> {
  const countValue = await SecureStore.getItemAsync(`${key}.chunks`);
  const count = Number.parseInt(countValue ?? '0', 10);
  await Promise.all([
    SecureStore.deleteItemAsync(`${key}.chunks`),
    ...Array.from({ length: Number.isFinite(count) ? count : 0 }, (_, index) => (
      SecureStore.deleteItemAsync(`${key}.${index}`)
    )),
  ]);
}

export const curioAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return webStorage()?.getItem(key) ?? memoryFallback.get(key) ?? null;
    if (!await secureStoreAvailable()) return memoryFallback.get(key) ?? null;
    const countValue = await SecureStore.getItemAsync(`${key}.chunks`);
    const count = Number.parseInt(countValue ?? '0', 10);
    if (!Number.isFinite(count) || count < 1) return null;
    const chunks = await Promise.all(Array.from({ length: count }, (_, index) => (
      SecureStore.getItemAsync(`${key}.${index}`)
    )));
    return chunks.every((chunk): chunk is string => chunk !== null) ? chunks.join('') : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      const storage = webStorage();
      if (storage) storage.setItem(key, value);
      else memoryFallback.set(key, value);
      return;
    }
    if (!await secureStoreAvailable()) {
      memoryFallback.set(key, value);
      return;
    }
    await removeNativeValue(key);
    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, index) => (
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    ));
    await Promise.all(chunks.map((chunk, index) => SecureStore.setItemAsync(`${key}.${index}`, chunk)));
    await SecureStore.setItemAsync(`${key}.chunks`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    memoryFallback.delete(key);
    if (Platform.OS === 'web') {
      webStorage()?.removeItem(key);
      return;
    }
    if (await secureStoreAvailable()) await removeNativeValue(key);
  },
};
