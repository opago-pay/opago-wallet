export const LIGHTNING_RECEIVE_REQUEST_KEY = 'opago.lightning.receive-request.v1';

const PAYMENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface StoredLightningReceiveRequest {
  requestId: string;
  invoice: string;
  paymentHash: string;
  amountSats: number;
  expiresAt: number;
  createdAt: string;
}

export interface LightningReceiveStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

function assertRequest(value: unknown): StoredLightningReceiveRequest {
  if (!value || typeof value !== 'object') {
    throw new Error('Saved Lightning request is invalid.');
  }
  const request = value as Partial<StoredLightningReceiveRequest>;
  if (
    typeof request.requestId !== 'string' ||
    request.requestId.length < 1 ||
    request.requestId.length > 256 ||
    typeof request.invoice !== 'string' ||
    request.invoice.length < 16 ||
    request.invoice.length > 16_384 ||
    typeof request.paymentHash !== 'string' ||
    !PAYMENT_HASH_PATTERN.test(request.paymentHash) ||
    !Number.isSafeInteger(request.amountSats) ||
    (request.amountSats || 0) <= 0 ||
    typeof request.expiresAt !== 'number' ||
    !Number.isSafeInteger(request.expiresAt) ||
    typeof request.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(request.createdAt))
  ) {
    throw new Error('Saved Lightning request is invalid.');
  }
  return request as StoredLightningReceiveRequest;
}

export function createLightningReceiveStore(storage: LightningReceiveStorage) {
  return {
    async load(): Promise<StoredLightningReceiveRequest | null> {
      const raw = await storage.getItem(LIGHTNING_RECEIVE_REQUEST_KEY);
      if (raw === null) return null;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        await storage.removeItem(LIGHTNING_RECEIVE_REQUEST_KEY);
        return null;
      }
      try {
        const request = assertRequest(value);
        if (request.expiresAt <= Date.now()) {
          await storage.removeItem(LIGHTNING_RECEIVE_REQUEST_KEY);
          return null;
        }
        return request;
      } catch {
        await storage.removeItem(LIGHTNING_RECEIVE_REQUEST_KEY);
        return null;
      }
    },

    async save(request: StoredLightningReceiveRequest): Promise<void> {
      await storage.setItem(LIGHTNING_RECEIVE_REQUEST_KEY, JSON.stringify(assertRequest(request)));
    },

    clear(): Promise<void> {
      return storage.removeItem(LIGHTNING_RECEIVE_REQUEST_KEY);
    },
  };
}
