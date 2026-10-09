const { admin, db } = require('./_admin');
const { webpush, configureWebPush } = require('./_push');
const { pushMessages } = require('./_pushMessages');
const { hasValidSecret } = require('./_secrets');

/**
 * Sends due reminders to every enabled push subscription.
 * Call it from a scheduler every 5–15 minutes with `Authorization: Bearer <secret>`
 * (or header `x-reminder-secret`), where the secret is REMINDER_CRON_SECRET or
 * CRON_SECRET (the variable Vercel Cron sends automatically).
 */
module.exports = async function handler(req, res) {
  if (!hasValidSecret(req, 'x-reminder-secret', ['REMINDER_CRON_SECRET', 'CRON_SECRET'])) {
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
    // users/{uid} parent documents usually do not exist (only their subcollections),
    // so query the subcollection group directly. Filtering `enabled` in code avoids
    // needing a collection-group index.
    const snapshot = await db.collectionGroup('pushSubscriptions').get();
    for (const subDoc of snapshot.docs) {
      const data = subDoc.data();
      if (data.enabled !== true) continue;
      checked += 1;

      const intervalMinutes = Number(data.intervalMinutes) > 0 ? Number(data.intervalMinutes) : 180;
      const lastSentAt = data.lastSentAt && data.lastSentAt.toDate ? data.lastSentAt.toDate().getTime() : 0;
      if ((nowMs - lastSentAt) / (1000 * 60) < intervalMinutes) continue;

      const messages = pushMessages(data.language);
      try {
        await webpush.sendNotification(
          { endpoint: data.endpoint, keys: data.keys },
          JSON.stringify({
            title: messages.reminderTitle,
            body: messages.reminderBody,
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
        } else {
          console.error('pushDispatchReminders send failed:', error?.statusCode, error?.message);
        }
      }
    }

    res.status(200).json({ success: true, checked, sent, removed });
  } catch (error) {
    console.error('pushDispatchReminders error:', error);
    res.status(500).json({ error: 'Internal error' });
  }
};
