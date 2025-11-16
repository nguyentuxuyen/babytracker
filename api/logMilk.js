const admin = require('firebase-admin');

// Initialize admin if not already
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

const db = admin.firestore();

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const secret = req.headers['x-log-secret'] || req.query.secret;
  if (!secret || secret !== process.env.LOG_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { amountMl, babyId, timestamp, note } = req.body || {};
  if (!amountMl || typeof amountMl !== 'number') {
    res.status(400).json({ error: 'Invalid amountMl' });
    return;
  }

  const targetBabyId = babyId || process.env.DEFAULT_BABY_ID;
  if (!targetBabyId) {
    res.status(400).json({ error: 'Missing babyId and no DEFAULT_BABY_ID configured' });
    return;
  }

  const userUid = process.env.SERVICE_ACCOUNT_USER_UID;
  if (!userUid) {
    res.status(400).json({ error: 'Missing SERVICE_ACCOUNT_USER_UID configuration' });
    return;
  }

  // Activity entry matching the web app structure
  const activity = {
    babyId: targetBabyId,
    type: 'feeding',
    timestamp: timestamp ? new Date(timestamp) : new Date(),
    details: {
      amount: amountMl,
      note: note || null
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  try {
    // Save to users/{userId}/activities (matching web app path)
    const docRef = db.collection('users').doc(userUid).collection('activities').doc();
    await docRef.set(activity);

    res.status(200).json({ success: true, id: docRef.id, activity });
  } catch (err) {
    console.error('Failed writing activity:', err);
    res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
