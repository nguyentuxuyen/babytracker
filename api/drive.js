// Google Drive for moment photos. The user connects once; the refresh token stays on
// the server (encrypted, in a Firestore doc the client cannot read) and the browser asks
// here for short-lived access tokens to upload and show photos itself.
//
// Scope is drive.file: the app only sees files and folders it created itself, never the
// rest of the user's Drive.
//
// POST {action}, with the Firebase ID token:
//   status     -> { configured, connected, folderId }
//   auth_url   -> { url }  (Google consent page; comes back to GET below)
//   token      -> { accessToken, expiresIn, folderId }  (409 not-connected)
//   disconnect -> { ok }
// GET ?code&state: Google's OAuth redirect; stores the token and returns to the app.
const crypto = require('crypto');
const { db, adminInitError, isAdminReady } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = 'Baby Tracker - Kỷ niệm';
const STATE_TTL_MS = 10 * 60 * 1000;

const clientId = () => process.env.GOOGLE_OAUTH_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_OAUTH_CLIENT_SECRET || '';
const isConfigured = () => Boolean(clientId() && clientSecret());

// One key for the state signature and token encryption. DRIVE_TOKEN_KEY is optional;
// without it the key comes from the client secret (rotating it means reconnecting).
const secretKey = () => crypto.createHash('sha256')
  .update(`babytracker-drive:${process.env.DRIVE_TOKEN_KEY || clientSecret()}`)
  .digest();

const redirectUri = (req) => {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `https://${host}/api/drive`;
};

const base64url = (buffer) => Buffer.from(buffer).toString('base64url');

const sign = (payload) => base64url(crypto.createHmac('sha256', secretKey()).update(payload).digest());

const NONCE_COOKIE = 'drive_oauth';

const makeState = (uid, returnTo, nonce, now = Date.now()) => {
  const payload = base64url(JSON.stringify({ uid, returnTo, nonce, at: now }));
  return `${payload}.${sign(payload)}`;
};

const readState = (state, now = Date.now()) => {
  if (typeof state !== 'string' || !state.includes('.')) return null;
  const [payload, signature] = state.split('.');
  const expected = sign(payload);
  if (signature.length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof data.uid !== 'string' || typeof data.at !== 'number' || typeof data.nonce !== 'string') return null;
    if (now - data.at > STATE_TTL_MS || data.at - now > 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
};

// Only same-site paths ("/settings", not "//evil.com" or "https://...").
const safeReturnTo = (value) => (typeof value === 'string' && /^\/(?!\/)[\w\-/?=&.%]*$/.test(value) ? value : '/settings');

const encrypt = (text) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(base64url).join('.');
};

const decrypt = (value) => {
  const [iv, tag, data] = String(value).split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

const authDoc = (uid) => db.collection('users').doc(uid).collection('driveAuth').doc('google');

const postForm = async (url, params) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
};

// The app's folder in the user's Drive: reused while it exists (the user may move or
// rename it), created again if it was deleted.
const ensureFolder = async (accessToken, folderId) => {
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (folderId) {
    const response = await fetch(`${DRIVE_FILES}/${encodeURIComponent(folderId)}?fields=id,trashed`, { headers });
    if (response.ok) {
      const file = await response.json();
      if (!file.trashed) return folderId;
    } else if (response.status !== 404) {
      throw new Error(`Drive folder check failed: ${response.status}`);
    }
  }
  const response = await fetch(`${DRIVE_FILES}?fields=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ROOT_FOLDER_NAME, mimeType: FOLDER_MIME })
  });
  if (!response.ok) throw new Error(`Drive folder create failed: ${response.status}`);
  return (await response.json()).id;
};

const redirect = (res, location) => {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
};

const withQuery = (path, key, value) => `${path}${path.includes('?') ? '&' : '?'}${key}=${value}`;

const cookieValue = (req, name) => {
  const match = String(req.headers.cookie || '').split(/;\s*/).find((part) => part.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : '';
};

const handleCallback = async (req, res) => {
  const { code, state, error } = req.query || {};
  const data = readState(state);
  const returnTo = safeReturnTo(data?.returnTo);
  // The state must come back to the same browser that asked for it, so a link made for
  // another account cannot attach this user's Drive to it.
  if (!data || cookieValue(req, NONCE_COOKIE) !== data.nonce) return redirect(res, withQuery('/settings', 'drive', 'error'));
  res.setHeader('Set-Cookie', `${NONCE_COOKIE}=; Path=/api/drive; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  if (error || !code) return redirect(res, withQuery(returnTo, 'drive', 'cancelled'));

  const exchanged = await postForm(TOKEN_ENDPOINT, {
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(req),
    grant_type: 'authorization_code'
  });
  const refreshToken = exchanged.body.refresh_token;
  if (!exchanged.ok || !refreshToken) {
    console.error('Drive code exchange failed', exchanged.status, exchanged.body.error);
    return redirect(res, withQuery(returnTo, 'drive', 'error'));
  }
  if (typeof exchanged.body.scope === 'string' && !exchanged.body.scope.split(' ').includes(SCOPE)) {
    return redirect(res, withQuery(returnTo, 'drive', 'cancelled'));
  }

  const ref = authDoc(data.uid);
  const previous = await ref.get();
  let folderId = previous.exists ? previous.data().folderId || null : null;
  try {
    folderId = await ensureFolder(exchanged.body.access_token, folderId);
  } catch (folderError) {
    // Not fatal: the next token request tries again.
    console.warn('Drive folder setup failed', folderError.message);
  }
  await ref.set({
    refreshToken: encrypt(refreshToken),
    folderId,
    connectedAt: new Date().toISOString()
  });
  return redirect(res, withQuery(returnTo, 'drive', 'connected'));
};

const handleToken = async (uid, res) => {
  const ref = authDoc(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) return res.status(409).json({ error: 'not-connected' });
  const stored = snapshot.data();

  let refreshToken;
  try {
    refreshToken = decrypt(stored.refreshToken);
  } catch {
    await ref.delete();
    return res.status(409).json({ error: 'not-connected' });
  }
  const refreshed = await postForm(TOKEN_ENDPOINT, {
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token'
  });
  if (!refreshed.ok) {
    if (refreshed.body.error === 'invalid_grant') {
      // Access was revoked in the Google account, or the token expired.
      await ref.delete();
      return res.status(409).json({ error: 'not-connected' });
    }
    console.error('Drive token refresh failed', refreshed.status, refreshed.body.error);
    return res.status(502).json({ error: 'token-failed' });
  }

  const accessToken = refreshed.body.access_token;
  const folderId = await ensureFolder(accessToken, stored.folderId);
  if (folderId !== stored.folderId) await ref.set({ folderId }, { merge: true });
  return res.status(200).json({ accessToken, expiresIn: Number(refreshed.body.expires_in) || 3600, folderId });
};

const handleDisconnect = async (uid, res) => {
  const ref = authDoc(uid);
  const snapshot = await ref.get();
  if (snapshot.exists) {
    try {
      await postForm(REVOKE_ENDPOINT, { token: decrypt(snapshot.data().refreshToken) });
    } catch (error) {
      console.warn('Drive revoke failed', error.message);
    }
    await ref.delete();
  }
  return res.status(200).json({ ok: true });
};

module.exports = async (req, res) => {
  if (!isAdminReady) {
    console.error('Firebase Admin not ready', adminInitError?.message);
    return res.status(500).json({ error: 'server-not-ready' });
  }

  if (req.method === 'GET') {
    if (!isConfigured()) return redirect(res, withQuery('/settings', 'drive', 'error'));
    try {
      return await handleCallback(req, res);
    } catch (error) {
      console.error('Drive callback failed', error);
      return redirect(res, withQuery('/settings', 'drive', 'error'));
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try {
    user = await verifyUserFromRequest(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.body?.action;
  try {
    if (action === 'status') {
      if (!isConfigured()) return res.status(200).json({ configured: false, connected: false, folderId: null });
      const snapshot = await authDoc(user.uid).get();
      return res.status(200).json({
        configured: true,
        connected: snapshot.exists,
        folderId: snapshot.exists ? snapshot.data().folderId || null : null
      });
    }
    if (!isConfigured()) return res.status(503).json({ error: 'not-configured' });
    if (action === 'auth_url') {
      const nonce = base64url(crypto.randomBytes(16));
      res.setHeader('Set-Cookie', `${NONCE_COOKIE}=${nonce}; Path=/api/drive; Max-Age=600; HttpOnly; Secure; SameSite=Lax`);
      const params = new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri(req),
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state: makeState(user.uid, safeReturnTo(req.body?.returnTo), nonce)
      });
      return res.status(200).json({ url: `${AUTH_ENDPOINT}?${params.toString()}` });
    }
    if (action === 'token') return await handleToken(user.uid, res);
    if (action === 'disconnect') return await handleDisconnect(user.uid, res);
    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    console.error('Drive action failed', action, error);
    return res.status(500).json({ error: 'failed' });
  }
};

module.exports._internal = { makeState, readState, encrypt, decrypt, safeReturnTo };
