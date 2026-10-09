const { admin, db } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');
const { normalizeLanguage } = require('./_pushMessages');
const { isAllowedPushEndpoint, subscriptionIdFor, legacySubscriptionIdFor } = require('./_subscriptions');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let uid;
  try {
    uid = (await verifyUserFromRequest(req)).uid;
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized or invalid token' });
    return;
  }

  const { subscription, intervalMinutes = 180, enabled = true, language } = req.body || {};
  if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    res.status(400).json({ error: 'Invalid push subscription payload' });
    return;
  }
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    res.status(400).json({ error: 'Unsupported push endpoint' });
    return;
  }

  try {
    const subscriptions = db.collection('users').doc(uid).collection('pushSubscriptions');
    const subscriptionId = subscriptionIdFor(subscription.endpoint);
    const docRef = subscriptions.doc(subscriptionId);
    const existing = await docRef.get();

    const interval = Math.min(24 * 60, Math.max(15, Number(intervalMinutes) || 180));
    await docRef.set({
      uid,
      endpoint: subscription.endpoint,
      keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) },
      enabled: Boolean(enabled),
      intervalMinutes: interval,
      language: normalizeLanguage(language),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      // Changing settings must not reset the reminder clock (that sent an extra reminder).
      ...(existing.exists ? {} : {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSentAt: admin.firestore.FieldValue.serverTimestamp()
      })
    }, { merge: true });

    const legacyId = legacySubscriptionIdFor(subscription.endpoint);
    if (legacyId !== subscriptionId) await subscriptions.doc(legacyId).delete();

    res.status(200).json({ success: true, subscriptionId });
  } catch (error) {
    console.error('pushSubscribe error:', error);
    res.status(500).json({ error: 'Could not save subscription' });
  }
};
