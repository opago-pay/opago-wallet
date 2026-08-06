import { assertSafeRemoteUrl } from './config';

export interface FetchJsonOptions {
  purpose: string;
  timeoutMs?: number;
  maxResponseChars?: number;
}

export async function fetchJson<T>(
  rawUrl: string,
  init: RequestInit = {},
  options: FetchJsonOptions,
): Promise<T> {
  const url = assertSafeRemoteUrl(rawUrl, options.purpose);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12_000);

  try {
    const response = await fetch(url.toString(), {
      ...init,
      redirect: 'error',
      signal: controller.signal,
    });
    if (response.redirected) throw new Error(options.purpose + ' redirected unexpectedly.');
    assertSafeRemoteUrl(response.url || url.toString(), options.purpose + ' final URL');
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error(options.purpose + ' returned an unexpected content type.');
    }

    const rawBody = await response.text();
    if (rawBody.length > (options.maxResponseChars ?? 262_144)) {
      throw new Error(options.purpose + ' returned an oversized response.');
    }
    let data: T & { status?: string; reason?: string };
    try {
      data = JSON.parse(rawBody) as T & { status?: string; reason?: string };
    } catch {
      throw new Error(options.purpose + ' returned invalid JSON.');
    }
    if (!response.ok) {
      throw new Error(data.reason || options.purpose + ' failed with HTTP ' + response.status + '.');
    }
    if (data.status === 'ERROR') {
      throw new Error(data.reason || options.purpose + ' returned an error.');
    }
    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(options.purpose + ' timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
