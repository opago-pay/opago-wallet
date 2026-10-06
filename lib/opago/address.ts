import { bech32 } from 'bech32';
import type { Address } from './contract-types';
import type { OpagoAccount } from './account';
import { photoMatchReady } from './account';
/** Only a fresh authoritative activation may be copied/shared or rendered as a QR. */
export function activeLightningAddress(account: OpagoAccount, publicOrigin = 'https://opago.com'): Address | null {
  const wallet = account.state.wallet; const address = wallet?.address;
  if (account.state.deletion || !photoMatchReady(wallet) || account.state.session?.scope !== 'wallet' ||
      !account.verifiedAt || account.now() - account.verifiedAt > 60_000 || !address || address.status !== 'active') return null;
  try {
    if (address.address !== address.name + '@' + new URL(publicOrigin).hostname || address.qr_payload !== 'lightning:' + address.lnurl ||
        address.lnurl !== address.lnurl.toUpperCase()) return null;
    const decoded = bech32.decode(address.lnurl, 4096);
    if (decoded.prefix !== 'lnurl') return null;
    const url = new URL(new TextDecoder().decode(Uint8Array.from(bech32.fromWords(decoded.words))));
    if (url.origin !== publicOrigin || url.username || url.password || url.hash || url.search ||
        url.pathname !== '/.well-known/lnurlp/' + address.name) return null;
    return address;
  } catch { return null; }
}
