const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const changelogSeed = require('../src/config/changelogSeed.json');

[
  '.env.local',
  '.env.production.local',
  '.env.production',
  '.env'
].forEach((fileName) => {
  const filePath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override: false });
  }
});

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

const run = async () => {
  const serviceAccount = parseServiceAccount();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id
    });
  }

  const db = admin.firestore();
  const rootRef = db.collection('app_meta').doc('changelog');
  const metaRef = rootRef.collection('meta').doc('current');
  const releasesRef = rootRef.collection('releases');

  await metaRef.set({
    currentVersion: changelogSeed.currentVersion,
    minSupportedVersion: changelogSeed.minSupportedVersion || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  for (const release of changelogSeed.releases) {
    await releasesRef.doc(release.version).set({
      version: release.version,
      releasedAt: new Date(release.releasedAt),
      title: release.title,
      summary: release.summary || '',
      changes: Array.isArray(release.changes) ? release.changes : [],
      isPublished: release.isPublished !== false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  console.log(`Synced ${changelogSeed.releases.length} changelog release(s) to Firestore.`);
};

run().catch((error) => {
  console.error('Failed to sync changelog to Firestore:', error);
  process.exitCode = 1;
});
