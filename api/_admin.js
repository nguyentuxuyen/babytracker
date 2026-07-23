const admin = require('firebase-admin');

let db = null;
let adminInitError = null;

const parseServiceAccount = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  let payload = rawJson;
  if (!payload && rawBase64) {
    payload = Buffer.from(rawBase64, 'base64').toString('utf8');
  }

  if (!payload) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_BASE64');
  }

  const serviceAccount = JSON.parse(payload);
  if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return serviceAccount;
};

if (!admin.apps.length) {
  try {
    const serviceAccount = parseServiceAccount();
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  } catch (err) {
    adminInitError = err;
    console.error('Firebase Admin initialization failed:', err.message);
  }
}

if (admin.apps.length) {
  db = admin.firestore();
}

module.exports = {
  admin,
  db,
  adminInitError,
  isAdminReady: !!db
};
