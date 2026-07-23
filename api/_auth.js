const { admin } = require('./_admin');

async function verifyUserFromRequest(req) {
  if (!admin.apps.length) {
    const error = new Error('Firebase Admin not initialized');
    error.code = 'FIREBASE_ADMIN_NOT_INITIALIZED';
    throw error;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    const error = new Error('Missing bearer token');
    error.code = 'AUTH_HEADER_MISSING';
    throw error;
  }

  const idToken = authHeader.slice('Bearer '.length);
  const decoded = await admin.auth().verifyIdToken(idToken);
  return decoded;
}

module.exports = {
  verifyUserFromRequest
};
