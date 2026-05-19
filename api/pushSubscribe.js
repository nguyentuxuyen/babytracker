const { admin, db } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const decoded = await verifyUserFromRequest(req);
    const uid = decoded.uid;
    const { subscription, intervalMinutes = 180, enabled = true } = req.body || {};

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      res.status(400).json({ error: 'Invalid push subscription payload' });
      return;
    }

    const subscriptionId = Buffer.from(subscription.endpoint).toString('base64').replace(/[+/=]/g, '').slice(0, 80);
    const docRef = db.collection('users').doc(uid).collection('pushSubscriptions').doc(subscriptionId);

    await docRef.set({
      uid,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      enabled: Boolean(enabled),
      intervalMinutes: Number(intervalMinutes) > 0 ? Number(intervalMinutes) : 180,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSentAt: null
    }, { merge: true });

    res.status(200).json({ success: true, subscriptionId });
  } catch (error) {
    console.error('pushSubscribe error:', error);
    res.status(401).json({ error: 'Unauthorized or invalid token' });
  }
};
