import { fetchJson } from './http';
import { validateLNURLResponse, type LNURLPResponse } from './lnurl-safe';
import { validateOcpOptions, type OcpResponse } from './ocp-safe';

export type PaymentEndpoint =
  | { kind: 'lnurl'; info: LNURLPResponse }
  | { kind: 'ocp'; quote: OcpResponse };

const RECENT_LNURL_MS = 10_000;
const recent = new Map<string, { at: number; info: LNURLPResponse }>();

/** A bech32 LNURL can encode either protocol. Classify one bounded response
 * instead of requesting the same remote URL as OCP, then LNURL. */
export async function loadPaymentEndpoint(url: string): Promise<PaymentEndpoint> {
  const cached = recent.get(url);
  if (cached && Date.now() - cached.at < RECENT_LNURL_MS) {
    return { kind: 'lnurl', info: cached.info };
  }
  recent.delete(url);
  const data = await fetchJson<Record<string, unknown>>(
    url, {}, { purpose: 'Payment endpoint' },
  );
  if (data.tag === 'payRequest') {
    const info = validateLNURLResponse(data as unknown as LNURLPResponse);
    const resolved = { ...info, recipientDomain: new URL(url).hostname };
    if (recent.size >= 8) recent.delete(recent.keys().next().value!);
    recent.set(url, { at: Date.now(), info: resolved });
    return { kind: 'lnurl', info: resolved };
  }
  return { kind: 'ocp', quote: validateOcpOptions(data as unknown as OcpResponse) };
}
