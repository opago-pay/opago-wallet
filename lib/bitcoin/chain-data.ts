import { Transaction } from '@scure/btc-signer';
import { hex } from '@scure/base';
import { sats } from './amount';
import { bitcoinNetwork, type BitcoinNetwork } from './destination';
import { withTimeout } from '../promise-timeout';
import { readBoundedText, strictFetch } from '../strict-http-transport';

/** Independent transaction data is checked against txid and our exact script.
 * Uses Spark 0.7.12's mainnet Electrs provider; no QR-controlled URL. */
export async function depositAmount(network: BitcoinNetwork, txid: string, vout: number, address: string): Promise<number> {
  if (!/^[a-f\d]{64}$/i.test(txid) || !Number.isSafeInteger(vout) || vout < 0) throw new Error('Invalid Bitcoin deposit.');
  // A regtest Electrs provider must be explicitly integrated; never query a
  // mainnet explorer for a test transaction or embed provider credentials.
  if (network !== 'MAINNET') throw new Error('Bitcoin deposit verification is unavailable on this test network.');
  const controller = new AbortController();
  try {
    const raw = await withTimeout((async () => {
      const response = await strictFetch(`https://mempool.space/api/tx/${txid}/hex`, { signal: controller.signal }, 8_000_000, true);
      if (!response.ok || response.redirected) throw new Error('Bitcoin transaction verification is unavailable.');
      const body = await readBoundedText(response, 'Bitcoin transaction verification',
        8_000_000, controller, 8_000_000);
      if (!/^[a-f\d]+$/i.test(body)) throw new Error('Invalid Bitcoin transaction.');
      return body;
    })(), 12_000, 'Bitcoin transaction verification timed out.');
    return verifyDepositOutput(raw, txid, vout, address, network);
  } finally { controller.abort(); }
}

export function verifyDepositOutput(raw: string, txid: string, vout: number, address: string, network: BitcoinNetwork): number {
  const tx = Transaction.fromRaw(hex.decode(raw), { allowUnknownOutputs: true });
  if (tx.id !== txid.toLowerCase() || tx.getOutputAddress(vout, bitcoinNetwork(network)) !== address) {
    throw new Error('Bitcoin deposit does not match this wallet.');
  }
  return sats(tx.getOutput(vout).amount);
}
