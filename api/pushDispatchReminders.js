const { admin, db } = require('./_admin');
const { webpush, configureWebPush } = require('./_push');

module.exports = async function handler(req, res) {
  const secret = req.headers['x-reminder-secret'] || req.query.secret;
  if (!secret || secret !== process.env.REMINDER_CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    configureWebPush();
  } catch (error) {
    res.status(500).json({ error: 'Missing VAPID config' });
    return;
  }

  let checked = 0;
  let sent = 0;
  let removed = 0;
  const nowMs = Date.now();

  try {
    const usersSnapshot = await db.collection('users').get();
    for (const userDoc of usersSnapshot.docs) {
      const subsSnapshot = await userDoc.ref.collection('pushSubscriptions')
        .where('enabled', '==', true)
        .get();

      for (const subDoc of subsSnapshot.docs) {
        checked += 1;
        const data = subDoc.data();
        const intervalMinutes = Number(data.intervalMinutes) > 0 ? Number(data.intervalMinutes) : 180;
        const lastSentAt = data.lastSentAt && data.lastSentAt.toDate ? data.lastSentAt.toDate().getTime() : 0;
        const elapsedMinutes = (nowMs - lastSentAt) / (1000 * 60);
        if (elapsedMinutes < intervalMinutes) {
          continue;
        }

        try {
          await webpush.sendNotification(
            { endpoint: data.endpoint, keys: data.keys },
            JSON.stringify({
              title: 'Baby Tracker Reminder',
              body: 'Đến giờ cập nhật hoạt động cho bé 👶',
              url: '/activities'
            })
          );
          sent += 1;
          await subDoc.ref.update({
            lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          if (error && (error.statusCode === 404 || error.statusCode === 410)) {
            removed += 1;
            await subDoc.ref.delete();
          }
        }
      }
    }

    res.status(200).json({ success: true, checked, sent, removed });
  } catch (error) {
    console.error('pushDispatchReminders error:', error);
    res.status(500).json({ error: 'Internal error', message: error.message });
  }
};
