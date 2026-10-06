export interface PrivateStore {
  read<T>(key: string): Promise<T | null>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
/** Synthetic tests only. Native runtime uses device-protected storage. */
export class MemoryPrivateStore implements PrivateStore {
  private values = new Map<string, string>();
  async read<T>(key: string): Promise<T | null> { const v = this.values.get(key); return v ? JSON.parse(v) as T : null; }
  async write(key: string, value: unknown) { this.values.set(key, JSON.stringify(value)); }
  async remove(key: string) { this.values.delete(key); }
}
