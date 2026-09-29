export const OPERATIONAL_HEALTH_KEY = 'opago.operational-health.v1';

export type OperationalService = 'lightning' | 'hedera';
export type OperationalErrorCategory =
  | 'authentication'
  | 'configuration'
  | 'network'
  | 'timeout'
  | 'validation'
  | 'unknown';

export interface ServiceHealthRecord {
  service: OperationalService;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCategory: OperationalErrorCategory | null;
}

export interface OperationalHealthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

type HealthDocument = Record<OperationalService, ServiceHealthRecord>;

function emptyRecord(service: OperationalService): ServiceHealthRecord {
  return {
    service,
    consecutiveFailures: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastErrorCategory: null,
  };
}

function emptyDocument(): HealthDocument {
  return { lightning: emptyRecord('lightning'), hedera: emptyRecord('hedera') };
}

function parse(raw: string | null): HealthDocument {
  if (!raw) return emptyDocument();
  try {
    const value = JSON.parse(raw) as Partial<HealthDocument>;
    const result = emptyDocument();
    for (const service of ['lightning', 'hedera'] as const) {
      const record = value[service];
      if (!record || record.service !== service) continue;
      result[service] = {
        service,
        consecutiveFailures: Number.isSafeInteger(record.consecutiveFailures) && record.consecutiveFailures >= 0
          ? record.consecutiveFailures
          : 0,
        lastSuccessAt: typeof record.lastSuccessAt === 'string' ? record.lastSuccessAt : null,
        lastFailureAt: typeof record.lastFailureAt === 'string' ? record.lastFailureAt : null,
        lastErrorCategory: [
          'authentication',
          'configuration',
          'network',
          'timeout',
          'validation',
          'unknown',
        ].includes(String(record.lastErrorCategory))
          ? record.lastErrorCategory
          : null,
      };
    }
    return result;
  } catch {
    return emptyDocument();
  }
}

export function categorizeOperationalError(cause: unknown): OperationalErrorCategory {
  const message = cause instanceof Error ? cause.message.toLowerCase() : String(cause || '').toLowerCase();
  if (/auth|biometric|identity|unlock|cancel/.test(message)) return 'authentication';
  if (/config|profile|mainnet|regtest|network.*match/.test(message)) return 'configuration';
  if (/timeout|timed out|deadline/.test(message)) return 'timeout';
  if (/invalid|expired|amount|invoice|recipient/.test(message)) return 'validation';
  if (/offline|fetch|connect|socket|network|unavailable|route/.test(message)) return 'network';
  return 'unknown';
}

export function createOperationalHealthStore(
  storage: OperationalHealthStorage,
  now: () => Date = () => new Date(),
) {
  let queue: Promise<unknown> = Promise.resolve();

  function exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const running = queue.then(operation, operation);
    queue = running.then(() => undefined, () => undefined);
    return running;
  }

  async function read(): Promise<HealthDocument> {
    return parse(await storage.getItem(OPERATIONAL_HEALTH_KEY));
  }

  async function write(document: HealthDocument): Promise<void> {
    await storage.setItem(OPERATIONAL_HEALTH_KEY, JSON.stringify(document));
  }

  return {
    get(service: OperationalService): Promise<ServiceHealthRecord> {
      return exclusive(async () => (await read())[service]);
    },

    recordSuccess(service: OperationalService): Promise<void> {
      return exclusive(async () => {
        const document = await read();
        document[service] = {
          ...document[service],
          consecutiveFailures: 0,
          lastSuccessAt: now().toISOString(),
          lastErrorCategory: null,
        };
        await write(document);
      });
    },

    recordFailure(service: OperationalService, cause: unknown): Promise<void> {
      return exclusive(async () => {
        const document = await read();
        document[service] = {
          ...document[service],
          consecutiveFailures: Math.min(document[service].consecutiveFailures + 1, 999),
          lastFailureAt: now().toISOString(),
          lastErrorCategory: categorizeOperationalError(cause),
        };
        await write(document);
      });
    },

    clear(): Promise<void> {
      return exclusive(() => storage.removeItem(OPERATIONAL_HEALTH_KEY));
    },
  };
}
