'use strict';

const crypto = require('crypto');
const http = require('http');
const { networkInterfaces } = require('os');
const { bech32 } = require('bech32');

const PORT = Number(process.env.OCP_DEMO_PORT || 3333);
const BIND_HOST = process.env.OCP_DEMO_BIND_HOST || '127.0.0.1';
const QUOTE_TTL_MS = Math.max(5_000, Number(process.env.OCP_DEMO_QUOTE_TTL_MS || 60_000));
const SOLANA_DESTINATION = process.env.OCP_DEMO_SOLANA_DESTINATION || '';
const LIGHTNING_INVOICE = process.env.OCP_DEMO_LIGHTNING_INVOICE || '';
const quotes = new Map();

function positiveNumber(name, fallback) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(name + ' must be positive.');
  return value;
}

const amounts = Object.freeze({
  fiat: positiveNumber('OCP_DEMO_FIAT_AMOUNT', 0.35),
  sat: positiveNumber('OCP_DEMO_SAT_AMOUNT', 550),
  sol: positiveNumber('OCP_DEMO_SOL_AMOUNT', 0.003),
  usdc: positiveNumber('OCP_DEMO_USDC_AMOUNT', 0.38),
});

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

function createQuote() {
  const transferAmounts = [];
  if (LIGHTNING_INVOICE) {
    transferAmounts.push({
      method: 'lightning',
      asset: 'SAT',
      chain: 'Lightning',
      amount: amounts.sat,
      fee: 0,
    });
  }
  if (SOLANA_DESTINATION) {
    transferAmounts.push(
      { method: 'solana', asset: 'SOL', chain: 'Solana', amount: amounts.sol, fee: 0.000005 },
      { method: 'solana', asset: 'USDC', chain: 'Solana', amount: amounts.usdc, fee: 0.000005 },
    );
  }
  if (transferAmounts.length === 0) {
    throw new Error(
      'Configure OCP_DEMO_SOLANA_DESTINATION and/or OCP_DEMO_LIGHTNING_INVOICE before requesting a quote.',
    );
  }

  const quote = {
    merchantName: process.env.OCP_DEMO_MERCHANT_NAME || 'Opago Demo Checkout',
    fiatAmount: amounts.fiat,
    fiatCurrency: process.env.OCP_DEMO_FIAT_CURRENCY || 'EUR',
    quoteId: crypto.randomUUID(),
    expiresAt: Date.now() + QUOTE_TTL_MS,
    transferAmounts,
    consumed: false,
  };
  quotes.set(quote.quoteId, quote);
  return quote;
}

function publicQuote(quote) {
  return {
    merchantName: quote.merchantName,
    fiatAmount: quote.fiatAmount,
    fiatCurrency: quote.fiatCurrency,
    quoteId: quote.quoteId,
    expiresAt: quote.expiresAt,
    transferAmounts: quote.transferAmounts,
  };
}

function executionPayload(url) {
  const quoteId = url.searchParams.get('quoteId') || '';
  const method = url.searchParams.get('method') || '';
  const asset = url.searchParams.get('asset') || '';
  const quote = quotes.get(quoteId);
  if (!quote) return { status: 404, body: { status: 'ERROR', reason: 'Unknown quote.' } };
  if (quote.expiresAt <= Date.now()) {
    quotes.delete(quoteId);
    return { status: 410, body: { status: 'ERROR', reason: 'Quote expired.' } };
  }
  if (quote.consumed) {
    return { status: 409, body: { status: 'ERROR', reason: 'Quote was already executed.' } };
  }

  const option = quote.transferAmounts.find(item => item.method === method && item.asset === asset);
  if (!option) {
    return { status: 400, body: { status: 'ERROR', reason: 'Method and asset are not in this quote.' } };
  }

  quote.consumed = true;
  if (option.method === 'lightning') {
    return {
      status: 200,
      body: {
        type: 'lightning',
        quoteId,
        asset: 'SAT',
        amount: option.amount,
        pr: LIGHTNING_INVOICE,
      },
    };
  }
  return {
    status: 200,
    body: {
      type: 'solana',
      quoteId,
      asset: option.asset,
      amount: option.amount,
      destination: SOLANA_DESTINATION,
    },
  };
}

const server = http.createServer((req, res) => {
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
    if (url.pathname !== '/ocp') return sendJson(res, 404, { error: 'Not found.' });

    if (url.searchParams.has('method')) {
      const result = executionPayload(url);
      return sendJson(res, result.status, result.body);
    }
    return sendJson(res, 200, publicQuote(createQuote()));
  } catch (error) {
    console.error('[OCP demo] Request failed:', error.message);
    return sendJson(res, 503, { status: 'ERROR', reason: error.message });
  }
});

function localAddress() {
  if (BIND_HOST !== '0.0.0.0') return BIND_HOST;
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const item of interfaces || []) {
      if (item.family === 'IPv4' && !item.internal) return item.address;
    }
  }
  return '127.0.0.1';
}

function announceServer() {
  const apiUrl = process.env.OCP_DEMO_PUBLIC_URL || 'http://' + localAddress() + ':' + PORT + '/ocp';
  const parsed = new URL(apiUrl);
  if (parsed.pathname !== '/ocp') throw new Error('OCP_DEMO_PUBLIC_URL must point to /ocp.');
  const encoded = encodeUrlToLNURL(parsed.toString());

  console.log('[OCP demo] Listening at ' + apiUrl);
  console.log('[OCP demo] Quotes expire and can be executed once. No fake payment data is generated.');
  try {
    require('qrcode-terminal').generate(encoded, { small: true });
  } catch {
    console.log('[OCP demo] QR rendering unavailable.');
  }
  console.log(encoded);
}

if (require.main === module) server.listen(PORT, BIND_HOST, announceServer);

module.exports = { server };
