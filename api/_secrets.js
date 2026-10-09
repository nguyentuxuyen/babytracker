const crypto = require('crypto');

// Secret from `Authorization: Bearer <secret>` or the given header. Query strings
// are not accepted: they end up in access logs.
const secretFromRequest = (req, headerName) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice('Bearer '.length).trim();
  const value = req.headers[headerName];
  return typeof value === 'string' ? value.trim() : '';
};

const safeEqual = (left, right) => {
  const a = crypto.createHash('sha256').update(String(left)).digest();
  const b = crypto.createHash('sha256').update(String(right)).digest();
  return crypto.timingSafeEqual(a, b);
};

// True when the request carries one of the configured secrets (unset env vars are ignored).
const hasValidSecret = (req, headerName, envNames) => {
  const provided = secretFromRequest(req, headerName);
  if (!provided) return false;
  return envNames
    .map((name) => process.env[name])
    .filter(Boolean)
    .some((expected) => safeEqual(provided, expected));
};

module.exports = { hasValidSecret };
