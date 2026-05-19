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
    const { endpoint } = req.body || {};

    if (!endpoint) {
      res.status(400).json({ error: 'Missing endpoint' });
      return;
    }

    const subscriptionId = Buffer.from(endpoint).toString('base64').replace(/[+/=]/g, '').slice(0, 80);
    const docRef = db.collection('users').doc(uid).collection('pushSubscriptions').doc(subscriptionId);
    await docRef.delete();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('pushUnsubscribe error:', error);
    res.status(401).json({ error: 'Unauthorized or invalid token' });
  }
};
