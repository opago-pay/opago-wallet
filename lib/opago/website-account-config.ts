import type { AppConfig } from './contract-types';
import type { WebsiteAccountAvailability } from './website-account';

/** AppConfig 0.2.0 has no website/session-handoff contract. Keep its wire schema
 * closed: oidc and the signed F3 HPKE key are NOT browser login configuration.
 * Replace only with a confirmed contract AND verified session exchange.
 */
export async function websiteAccountAvailability(
  configuration: (signal: AbortSignal) => Promise<AppConfig>, signal: AbortSignal,
): Promise<WebsiteAccountAvailability> {
  await configuration(signal);
  return { status: 'unavailable' };
}
