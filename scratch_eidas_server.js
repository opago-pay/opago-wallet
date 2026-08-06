'use strict';

const crypto = require('crypto');
const http = require('http');
const { networkInterfaces } = require('os');
const { bech32 } = require('bech32');

const PORT = Number(process.env.EIDAS_DEMO_PORT || 4444);
const BIND_HOST = process.env.EIDAS_DEMO_BIND_HOST || '127.0.0.1';
const BACKEND_URL = process.env.EIDAS_BACKEND_URL || 'http://127.0.0.1:5555';
const AMOUNT_MSAT = Number(process.env.EIDAS_DEMO_AMOUNT_MSAT || 1000);
const usedProofs = new Map();

if (!Number.isSafeInteger(AMOUNT_MSAT) || AMOUNT_MSAT <= 0 || AMOUNT_MSAT % 1000 !== 0) {
  throw new Error('EIDAS_DEMO_AMOUNT_MSAT must be a positive whole-satoshi amount.');
}

function encodeUrlToLNURL(url) {
  return bech32.encode('lnurl', bech32.toWords(Buffer.from(url, 'utf8')), 2000);
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

async function fetchJson(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (response.redirected) throw new Error('Unexpected redirect.');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const type = response.headers.get('content-type') || '';
    if (!type.toLowerCase().includes('application/json')) throw new Error('Expected JSON response.');
    const body = await response.text();
    if (body.length > 65_536) throw new Error('Oversized JSON response.');
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('Invalid JSON response.');
    }
  } finally {
    clearTimeout(timer);
  }
}

function canonicalIdentityPayload(payerData) {
  const fields = {
    name: payerData.name,
    identifier: payerData.identifier,
    walletIdentifier: payerData.walletIdentifier,
    kycStatus: payerData.kycStatus,
    provider: payerData.provider,
    transactionReference: payerData.transactionReference,
    sessionNonce: payerData.sessionNonce,
    issuedAt: payerData.issuedAt,
    expiresAt: payerData.expiresAt,
  };
  for (const [name, value] of Object.entries(fields)) {
    if (name === 'issuedAt' || name === 'expiresAt') {
      if (!Number.isSafeInteger(value)) throw new Error('Invalid ' + name + '.');
    } else if (typeof value !== 'string' || value.length < 3 || value.length > 300) {
      throw new Error('Invalid ' + name + '.');
    }
  }
  if (fields.kycStatus !== 'verified') throw new Error('Identity is not verified.');
  if (fields.issuedAt > Date.now() + 30_000 || fields.expiresAt <= Date.now()) {
    throw new Error('Identity proof is expired or not yet valid.');
  }
  if (fields.expiresAt - fields.issuedAt > 120_000) throw new Error('Identity proof lifetime is too long.');
  return fields;
}

async function verifyPayerData(payerData) {
  if (!payerData || typeof payerData !== 'object') throw new Error('Missing payer data.');
  const compliance = payerData.compliance;
  if (
    !compliance ||
    compliance.mandatory !== true ||
    compliance.algorithm !== 'ed25519' ||
    !/^[a-f0-9]{128}$/i.test(compliance.signature || '')
  ) {
    throw new Error('Missing or invalid compliance signature.');
  }

  const keyInfo = await fetchJson(BACKEND_URL.replace(/\/$/, '') + '/api/keys/public');
  if (keyInfo.algorithm !== 'ed25519' || !/^[a-f0-9]+$/i.test(keyInfo.publicKey || '')) {
    throw new Error('The eID backend returned an invalid public key.');
  }

  const publicKey = crypto.createPublicKey({
    key: Buffer.from(keyInfo.publicKey, 'hex'),
    format: 'der',
    type: 'spki',
  });
  const payload = canonicalIdentityPayload(payerData);
  const valid = crypto.verify(
    null,
    Buffer.from(JSON.stringify(payload)),
    publicKey,
    Buffer.from(compliance.signature, 'hex'),
  );
  if (!valid) throw new Error('Invalid eIDAS signature.');
  if (usedProofs.has(compliance.signature)) throw new Error('Identity proof was already used.');
  return compliance.signature;
}

async function obtainInvoice() {
  const configuredInvoice = process.env.EIDAS_DEMO_INVOICE || '';
  if (configuredInvoice) return configuredInvoice;

  const providerUrl = process.env.EIDAS_DEMO_INVOICE_URL || '';
  if (!providerUrl) {
    throw new Error('Configure EIDAS_DEMO_INVOICE or EIDAS_DEMO_INVOICE_URL. Fake invoices are disabled.');
  }
  const url = new URL(providerUrl);
  url.searchParams.set('amount', String(AMOUNT_MSAT));
  const data = await fetchJson(url.toString());
  if (typeof data.pr !== 'string') throw new Error('Invoice provider returned no payment request.');
  return data.pr;
}

function publicBaseUrl() {
  if (process.env.EIDAS_DEMO_PUBLIC_BASE_URL) {
    return process.env.EIDAS_DEMO_PUBLIC_BASE_URL.replace(/\/$/, '');
  }
  let host = BIND_HOST;
  if (host === '0.0.0.0') {
    host = '127.0.0.1';
    for (const interfaces of Object.values(networkInterfaces())) {
      const candidate = (interfaces || []).find(item => item.family === 'IPv4' && !item.internal);
      if (candidate) {
        host = candidate.address;
        break;
      }
    }
  }
  return 'http://' + host + ':' + PORT;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
      });
      return res.end();
    }
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });

    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/lnurl-eidas') {
      return sendJson(res, 200, {
        callback: publicBaseUrl() + '/lnurl-eidas/callback',
        maxSendable: AMOUNT_MSAT,
        minSendable: AMOUNT_MSAT,
        metadata: JSON.stringify([['text/plain', 'Opago eIDAS demo payment']]),
        tag: 'payRequest',
        compliance: { isSubjectToTravelRule: true },
        payerData: { compliance: { mandatory: true } },
      });
    }

    if (url.pathname === '/lnurl-eidas/callback') {
      if (url.searchParams.get('amount') !== String(AMOUNT_MSAT)) {
        return sendJson(res, 400, { status: 'ERROR', reason: 'Amount does not match the LNURL request.' });
      }
      const raw = url.searchParams.get('payerdata');
      if (!raw || raw.length > 12_000) {
        return sendJson(res, 400, { status: 'ERROR', reason: 'Missing or oversized payer data.' });
      }
      const payerData = JSON.parse(raw);
      const proofId = await verifyPayerData(payerData);
      const invoice = await obtainInvoice();
      if (!/^(lnbc|lntb|lnbcrt|lnsb)/i.test(invoice)) throw new Error('Invoice provider returned invalid BOLT11 data.');
      usedProofs.set(proofId, Number(payerData.expiresAt));
      console.log('[eIDAS demo] Verified one signed identity proof; no personal data was logged.');
      return sendJson(res, 200, { pr: invoice });
    }

    return sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error('[eIDAS demo] Request failed:', error.message);
    return sendJson(res, 400, { status: 'ERROR', reason: error.message });
  }
});

const cleanup = setInterval(() => {
  for (const [proof, expiresAt] of usedProofs) {
    if (expiresAt <= Date.now()) usedProofs.delete(proof);
  }
}, 60_000);
cleanup.unref();

function announceServer() {
  const endpoint = publicBaseUrl() + '/lnurl-eidas';
  const encoded = encodeUrlToLNURL(endpoint);
  console.log('[eIDAS demo] Listening at ' + endpoint);
  console.log('[eIDAS demo] A verified, unexpired, single-use Ed25519 proof is required.');
  try {
    require('qrcode-terminal').generate(encoded, { small: true });
  } catch {
    console.log('[eIDAS demo] QR rendering unavailable.');
  }
  console.log(encoded);
}

if (require.main === module) server.listen(PORT, BIND_HOST, announceServer);

module.exports = { server };
