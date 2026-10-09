const { db } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');
const { subscriptionIdFor, legacySubscriptionIdFor } = require('./_subscriptions');

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

  const { endpoint } = req.body || {};
  if (!endpoint || typeof endpoint !== 'string') {
    res.status(400).json({ error: 'Missing endpoint' });
    return;
  }

  try {
    const subscriptions = db.collection('users').doc(uid).collection('pushSubscriptions');
    await Promise.all([
      subscriptions.doc(subscriptionIdFor(endpoint)).delete(),
      subscriptions.doc(legacySubscriptionIdFor(endpoint)).delete()
    ]);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('pushUnsubscribe error:', error);
    res.status(500).json({ error: 'Could not remove subscription' });
  }
};
