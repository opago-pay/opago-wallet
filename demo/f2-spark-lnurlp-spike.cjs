'use strict';

// Local protocol probe only. The caller supplies an initialized Spark SDK wallet;
// this file never loads a user seed or exposes a public service.
const { createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { decode } = require('light-bolt11-decoder');

const EXPIRY_SECONDS = 600;

function createSparkInvoiceAdapter(wallet, receiverIdentityPubkey, network = 'bcrt') {
  if (!/^(02|03)[0-9a-f]{64}$/i.test(receiverIdentityPubkey)) {
    throw new Error('A compressed Spark receiver identity public key is required.');
  }
  if (!['bc', 'bcrt'].includes(network)) throw new Error('Unsupported spike network.');
  return async ({ amountSats, metadata }) => {
    const descriptionHash = createHash('sha256').update(metadata, 'utf8').digest('hex');
    const result = await wallet.createLightningInvoice({
      amountSats,
      receiverIdentityPubkey,
      descriptionHash,
      expirySeconds: EXPIRY_SECONDS,
    });
    const pr = typeof result.invoice === 'string' ? result.invoice : result.invoice?.encodedInvoice;
    if (typeof pr !== 'string' || !pr) throw new Error('Spark returned no BOLT11 invoice.');
    const decoded = decode(pr);
    const section = name => decoded.sections.find(item => item.name === name)?.value;
    const timestamp = Number(section('timestamp'));
    const expiry = Number(section('expiry') ?? 3600);
    if (!pr.toLowerCase().startsWith(`ln${network}`) ||
        section('amount') !== String(amountSats * 1000) ||
        String(section('description_hash')).toLowerCase() !== descriptionHash ||
        !/^[0-9a-f]{64}$/i.test(String(section('payment_hash'))) ||
        !Number.isSafeInteger(timestamp) || !Number.isSafeInteger(expiry) ||
        (timestamp + expiry) * 1000 <= Date.now()) {
      throw new Error('Spark invoice failed LNURL-P checks.');
    }
    return pr;
  };
}

function createLnurlpSpikeServer({ alias, publicOrigin, createInvoice, minSats = 1, maxSats = 100_000 }) {
  if (!/^[a-z0-9_.-]+$/.test(alias) || typeof createInvoice !== 'function') {
    throw new Error('Invalid spike configuration.');
  }
  const origin = new URL(publicOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/') {
    throw new Error('Invalid public origin.');
  }
  if (!Number.isSafeInteger(minSats) || !Number.isSafeInteger(maxSats) || minSats < 1 || maxSats < minSats ||
      !Number.isSafeInteger(maxSats * 1000)) throw new Error('Invalid payment limits.');

  const metadata = JSON.stringify([
    ['text/plain', `Pay ${alias}@${origin.hostname}`],
    ['text/identifier', `${alias}@${origin.hostname}`],
  ]);
  const discoveryPath = `/.well-known/lnurlp/${alias}`;
  const callbackPath = `/lnurlp/${alias}/callback`;
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  return createServer(async (req, res) => {
    if (req.method !== 'GET') return json(res, 405, { status: 'ERROR', reason: 'Method not allowed' });
    const url = new URL(req.url, origin);
    if (url.pathname === discoveryPath && !url.search) {
      return json(res, 200, {
        tag: 'payRequest', callback: new URL(callbackPath, origin).toString(),
        minSendable: minSats * 1000, maxSendable: maxSats * 1000, metadata,
      });
    }
    if (url.pathname !== callbackPath) return json(res, 404, { status: 'ERROR', reason: 'Not found' });
    const values = url.searchParams.getAll('amount');
    if (values.length !== 1 || !/^[1-9][0-9]*$/.test(values[0])) {
      return json(res, 400, { status: 'ERROR', reason: 'Invalid amount' });
    }
    const millisats = Number(values[0]);
    if (!Number.isSafeInteger(millisats) || millisats % 1000 !== 0 ||
        millisats < minSats * 1000 || millisats > maxSats * 1000) {
      return json(res, 400, { status: 'ERROR', reason: 'Amount out of range' });
    }
    try {
      const pr = await createInvoice({ amountSats: millisats / 1000, metadata });
      return json(res, 200, { pr, routes: [] });
    } catch {
      return json(res, 503, { status: 'ERROR', reason: 'Invoice temporarily unavailable' });
    }
  });
}

module.exports = { createSparkInvoiceAdapter, createLnurlpSpikeServer };
