import type { HkaHttp } from './hka';
import type { AppConfig } from './contract-types';
import { assertContract } from './contract';
import { parseStrictJson, utf8 } from './encoding';
import { PUBLIC_API_ORIGIN } from './public-account-origin';
import { WebsiteAccountError } from './website-account';

/** Fresh public runtime configuration only; no identity-provider discovery. */
export class RuntimeConfigClient {
  constructor(private readonly http: HkaHttp, private readonly platform: 'ios' | 'android', private readonly build: number,
    private readonly now = Date.now) {}
  async configuration(signal?: AbortSignal): Promise<AppConfig> {
    const check = () => { if (signal?.aborted) throw new WebsiteAccountError('cancelled'); };
    check();
    try {
      if (!Number.isSafeInteger(this.build) || this.build < 1) throw new WebsiteAccountError();
      const response = await this.http(PUBLIC_API_ORIGIN + '/api/v2/app/config', { method: 'GET',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, signal, maxBytes: 32768, timeoutMs: 10000 });
      check();
      if (response.status !== 200 || !/^application\/json(?:\s*;|$)/i.test(response.contentType) ||
        !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.cacheControl || '') || utf8(response.body).length > 32768) throw new WebsiteAccountError();
      const config = parseStrictJson(response.body);
      assertContract<AppConfig>('AppConfig', config);
      const issued = Date.parse(config.issued_at), expires = Date.parse(config.valid_until), now = this.now();
      if (config.audience !== PUBLIC_API_ORIGIN || issued > now + 300000 || expires <= now || expires <= issued) throw new WebsiteAccountError();
      if (config.min_supported_build[this.platform] > this.build) throw new WebsiteAccountError('update');
      return config;
    } catch (error) {
      check();
      if (error instanceof WebsiteAccountError) throw error;
      throw new WebsiteAccountError();
    }
  }
}
