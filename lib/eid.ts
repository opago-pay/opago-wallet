import { assertSafeRemoteUrl, requireEIdBackendUrl } from './config';
import { fetchJson } from './http';

export interface EIdSession {
  sessionId: string;
  tcTokenURL: string;
  demo: boolean;
}

interface EIdStatusResponse {
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';
  payerData?: Record<string, unknown>;
  reason?: string;
}

export async function startEIdSession(input: {
  walletIdentifier: string;
  transactionReference: string;
}): Promise<EIdSession> {
  const backendUrl = requireEIdBackendUrl();
  const response = await fetchJson<EIdSession>(
    backendUrl + '/api/eid/session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    { purpose: 'eID session', timeoutMs: 15_000 },
  );
  if (!response.sessionId || !response.tcTokenURL || typeof response.demo !== 'boolean') {
    throw new Error('eID backend returned an invalid session.');
  }
  return { ...response, tcTokenURL: assertSafeRemoteUrl(response.tcTokenURL, 'eID tcToken').toString() };
}

export async function waitForVerifiedEId(
  sessionId: string,
  timeoutMs = 120_000,
): Promise<Record<string, unknown>> {
  if (!/^[a-f0-9-]{20,}$/i.test(sessionId)) throw new Error('Invalid eID session identifier.');
  const backendUrl = requireEIdBackendUrl();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await fetchJson<EIdStatusResponse>(
      backendUrl + '/api/eid/session/' + encodeURIComponent(sessionId) + '/status',
      {},
      { purpose: 'eID verification status', timeoutMs: 10_000 },
    );
    if (response.status === 'SUCCESS' && response.payerData) return response.payerData;
    if (response.status === 'FAILED' || response.status === 'EXPIRED') {
      throw new Error(response.reason || 'eID verification did not succeed.');
    }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }

  throw new Error('eID verification timed out. No payment was made.');
}
