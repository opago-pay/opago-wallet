const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.EID_PORT || 5555);
const BIND_HOST = process.env.EID_BIND_HOST || '127.0.0.1';
const DEMO_MODE = process.env.EID_DEMO_MODE === 'true';
const SESSION_TTL_MS = Number(process.env.EID_SESSION_TTL_MS || 5 * 60 * 1000);
const MAX_ACTIVE_SESSIONS = Number(process.env.EID_MAX_ACTIVE_SESSIONS || 10_000);
const SESSION_RATE_LIMIT = Number(process.env.EID_SESSION_RATE_LIMIT_PER_MINUTE || 30);
const RATE_WINDOW_MS = 60_000;
const CALLBACK_SECRET = process.env.EID_CALLBACK_SECRET || '';
const DEMO_SECRET = process.env.EID_DEMO_SECRET || '';
const ALLOWED_ORIGINS = new Set(
  (process.env.EID_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

if (!Number.isSafeInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error('EID_PORT must be a valid TCP port.');
}
if (!Number.isSafeInteger(SESSION_TTL_MS) || SESSION_TTL_MS < 30_000 || SESSION_TTL_MS > 15 * 60_000) {
  throw new Error('EID_SESSION_TTL_MS must be between 30 seconds and 15 minutes.');
}
if (!Number.isSafeInteger(MAX_ACTIVE_SESSIONS) || MAX_ACTIVE_SESSIONS < 1) {
  throw new Error('EID_MAX_ACTIVE_SESSIONS must be a positive integer.');
}
if (!Number.isSafeInteger(SESSION_RATE_LIMIT) || SESSION_RATE_LIMIT < 1) {
  throw new Error('EID_SESSION_RATE_LIMIT_PER_MINUTE must be a positive integer.');
}
function loadSigningKeys() {
  const pem = process.env.EID_ED25519_PRIVATE_KEY_PEM?.replace(/\\n/g, '\n');
  if (pem) {
    const privateKey = crypto.createPrivateKey(pem);
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('EID_ED25519_PRIVATE_KEY_PEM must contain an Ed25519 private key.');
    }
    return { privateKey, publicKey: crypto.createPublicKey(privateKey) };
  }
  if (!DEMO_MODE) {
    throw new Error('Production mode requires EID_ED25519_PRIVATE_KEY_PEM.');
  }
  console.warn('[eID] Demo mode uses an ephemeral signing key. Signatures are not production trust anchors.');
  return crypto.generateKeyPairSync('ed25519');
}
if (DEMO_MODE && DEMO_SECRET.length < 16) {
  throw new Error('Demo mode requires EID_DEMO_SECRET with at least 16 characters.');
}
if (!DEMO_MODE && process.env.EID_ALLOW_IN_MEMORY_REFERENCE_BACKEND !== 'true') {
  throw new Error(
    'The bundled eID backend is an in-memory reference service. Production-like use requires EID_ALLOW_IN_MEMORY_REFERENCE_BACKEND=true and external operational safeguards.',
  );
}

if (!DEMO_MODE && (CALLBACK_SECRET.length < 32 || !process.env.EID_TCTOKEN_URL)) {
  throw new Error('Production mode requires EID_CALLBACK_SECRET (32+ characters) and EID_TCTOKEN_URL.');
}

const { privateKey, publicKey } = loadSigningKeys();
const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
const sessions = new Map();

const rateBuckets = new Map();
function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.end(JSON.stringify(body));
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    return true;
  }
  return false;
}

function readJson(req, limit = 16_384) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function validIdentifier(value) {
  return typeof value === 'string' && value.length >= 3 && value.length <= 200;
}

function getSession(id) {
  const session = sessions.get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    session.status = 'EXPIRED';
    session.reason = 'Identity session expired.';
  }
  return session;
}

function authorizeBearer(req, expected) {
  if (!expected) return false;
  const value = req.headers.authorization || '';
  const supplied = value.startsWith('Bearer ') ? value.slice(7) : '';
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function consumeSessionRateLimit(req) {
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= SESSION_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}
function completeSession(session, verifiedData) {
  if (
    !verifiedData ||
    !validIdentifier(verifiedData.subjectId) ||
    !validIdentifier(verifiedData.displayName) ||
    verifiedData.kycStatus !== 'verified'
  ) {
    throw new Error('Verified identity payload is incomplete.');
  }
  session.status = 'SUCCESS';
  session.verifiedData = {
    subjectId: verifiedData.subjectId,
    displayName: verifiedData.displayName,
    kycStatus: verifiedData.kycStatus,
    provider: String(verifiedData.provider || 'configured-eid-provider').slice(0, 100),
  };
}

function signedPayerData(session) {
  if (session.payerData) return session.payerData;
  const issuedAt = Date.now();
  const payload = {
    name: session.verifiedData.displayName,
    identifier: session.verifiedData.subjectId,
    walletIdentifier: session.walletIdentifier,
    kycStatus: session.verifiedData.kycStatus,
    provider: session.verifiedData.provider,
    transactionReference: session.transactionReference,
    sessionNonce: session.nonce,
    issuedAt,
    expiresAt: Math.min(session.expiresAt, issuedAt + 60_000),
  };
  const canonicalPayload = JSON.stringify(payload);
  session.payerData = {
    ...payload,
    compliance: {
      mandatory: true,
      algorithm: 'ed25519',
      signature: crypto.sign(null, Buffer.from(canonicalPayload), privateKey).toString('hex'),
    },
  };
  return session.payerData;
}

const server = http.createServer(async (req, res) => {
  try {
    if (!setCors(req, res)) return sendJson(res, 403, { error: 'Origin not allowed.' });
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      });
      return res.end();
    }

    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/keys/public') {
      return sendJson(res, 200, { algorithm: 'ed25519', publicKey: publicKeyDer });
    }

    if (req.method === 'POST' && url.pathname === '/api/eid/session') {
      if (!consumeSessionRateLimit(req)) {
        return sendJson(res, 429, { error: 'Too many identity-session requests.' });
      }
      const body = await readJson(req);
      if (sessions.size >= MAX_ACTIVE_SESSIONS) {
        return sendJson(res, 503, { error: 'Session capacity reached.' });
      }
      if (!validIdentifier(body.walletIdentifier) || !validIdentifier(body.transactionReference)) {
        return sendJson(res, 400, { error: 'Invalid wallet identifier or transaction reference.' });
      }
      const sessionId = crypto.randomUUID();
      const tcTokenURL = DEMO_MODE
        ? process.env.EID_TCTOKEN_URL ||
          'https://test.governikus-eid.de/AusweisAuskunft/WebServiceRequesterServlet'
        : process.env.EID_TCTOKEN_URL;
      sessions.set(sessionId, {
        id: sessionId,
        walletIdentifier: body.walletIdentifier,
        transactionReference: body.transactionReference,
        nonce: crypto.randomBytes(24).toString('hex'),
        status: 'PENDING',
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL_MS,
      });
      if (DEMO_MODE) {
        console.log('[eID demo] Created session ' + sessionId + '; authenticated manual completion is required.');
      }
      return sendJson(res, 201, { sessionId, tcTokenURL, demo: DEMO_MODE });
    }

    const callbackMatch = url.pathname.match(/^\/api\/eid\/session\/([a-f0-9-]+)\/callback$/i);
    if (req.method === 'POST' && callbackMatch) {
      if (!authorizeBearer(req, CALLBACK_SECRET)) {
        return sendJson(res, 401, { error: 'Unauthorized provider callback.' });
      }
      const session = getSession(callbackMatch[1]);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      if (session.status !== 'PENDING') return sendJson(res, 409, { error: 'Session is not pending.' });
      const body = await readJson(req);
      completeSession(session, body.verifiedData);
      return sendJson(res, 200, { status: 'SUCCESS' });
    }

    const demoMatch = url.pathname.match(/^\/api\/eid\/session\/([a-f0-9-]+)\/demo-complete$/i);
    if (req.method === 'POST' && demoMatch) {
      if (!DEMO_MODE) return sendJson(res, 404, { error: 'Not found.' });
      if (!authorizeBearer(req, DEMO_SECRET)) {
        return sendJson(res, 401, { error: 'Unauthorized demo completion.' });
      }
      const session = getSession(demoMatch[1]);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      if (session.status !== 'PENDING') return sendJson(res, 409, { error: 'Session is not pending.' });
      completeSession(session, {
        subjectId: 'demo-subject-' + session.id,
        displayName: 'DEMO IDENTITY',
        kycStatus: 'verified',
        provider: 'explicit-demo-mode',
      });
      return sendJson(res, 200, { status: 'SUCCESS', demo: true });
    }

    const statusMatch = url.pathname.match(/^\/api\/eid\/session\/([a-f0-9-]+)\/status$/i);
    if (req.method === 'GET' && statusMatch) {
      const session = getSession(statusMatch[1]);
      if (!session) return sendJson(res, 404, { error: 'Session not found.' });
      if (session.status === 'SUCCESS') {
        return sendJson(res, 200, {
          status: 'SUCCESS',
          payerData: signedPayerData(session),
          demo: DEMO_MODE,
        });
      }
      return sendJson(res, 200, {
        status: session.status,
        reason: session.reason,
        demo: DEMO_MODE,
      });
    }

    return sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error('[eID] Request failed:', error.message);
    if (!res.headersSent) sendJson(res, 400, { error: error.message });
    else res.end();
  }
});

const cleanup = setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.expiresAt < cutoff) sessions.delete(id);
  }
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= Date.now()) rateBuckets.delete(key);
  }
}, 60_000);
cleanup.unref();

if (require.main === module) {
  server.listen(PORT, BIND_HOST, () => {
    console.log(
      '[eID] Reference backend listening on ' + BIND_HOST + ':' + PORT +
        (DEMO_MODE ? ' in explicit DEMO mode' : ' with production-like safeguards'),
    );
  });
}

module.exports = { server };
