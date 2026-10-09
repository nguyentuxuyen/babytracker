const crypto = require('crypto');

// Push services browsers actually use. Anything else is refused so the server
// never POSTs to an arbitrary URL supplied by a client.
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^(.+\.)?push\.apple\.com$/,
  /^(.+\.)?notify\.windows\.com$/
];

const isAllowedPushEndpoint = (endpoint) => {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && ALLOWED_PUSH_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
};

const subscriptionIdFor = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

// Id scheme used before 2026-10: truncated base64 of the endpoint (could collide).
const legacySubscriptionIdFor = (endpoint) =>
  Buffer.from(endpoint).toString('base64').replace(/[+/=]/g, '').slice(0, 80);

module.exports = { isAllowedPushEndpoint, subscriptionIdFor, legacySubscriptionIdFor };
