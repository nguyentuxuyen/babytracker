const { db } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');
const { webpush, configureWebPush } = require('./_push');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    configureWebPush();
    const decoded = await verifyUserFromRequest(req);
    const uid = decoded.uid;

    const snapshot = await db.collection('users').doc(uid).collection('pushSubscriptions')
      .where('enabled', '==', true)
      .get();

    if (snapshot.empty) {
      res.status(200).json({ success: true, sent: 0, message: 'No active subscriptions' });
      return;
    }

    const payload = JSON.stringify({
      title: 'Baby Tracker',
      body: 'Đây là thông báo thử nghiệm từ Baby Tracker 👶',
      url: '/activities'
    });

    let sent = 0;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      try {
        await webpush.sendNotification(
          { endpoint: data.endpoint, keys: data.keys },
          payload
        );
        sent += 1;
      } catch (error) {
        if (error && (error.statusCode === 404 || error.statusCode === 410)) {
          await doc.ref.delete();
        }
      }
    }

    res.status(200).json({ success: true, sent });
  } catch (error) {
    console.error('pushSendTest error:', error);
    res.status(401).json({ error: 'Unauthorized or push config missing' });
  }
};
