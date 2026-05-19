const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    console.error('Missing FIREBASE_SERVICE_ACCOUNT env var');
  } else {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id
      });
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
    }
  }
}

module.exports = {
  admin,
  db: admin.firestore()
};
