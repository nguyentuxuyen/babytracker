const { admin } = require('./_admin');

async function verifyUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }

  const idToken = authHeader.slice('Bearer '.length);
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
}

module.exports = {
  verifyUserFromRequest
};
