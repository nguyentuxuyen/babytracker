const { db, admin } = require('./_admin');
const { hasValidSecret } = require('./_secrets');
const { buildActivityDoc, ActivityValidationError } = require('../src/domain/activitySchema');
const { parseUserTimestamp, normalizeOffset } = require('./_time');

/**
 * Quick milk logging for the Siri shortcut (scripts/SIRI_SHORTCUT.md).
 * POST { amountMl, timestamp?, note? } with header `x-log-secret: <LOG_SECRET>`
 * (or `Authorization: Bearer <LOG_SECRET>`). Writes to SERVICE_ACCOUNT_USER_UID.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!hasValidSecret(req, 'x-log-secret', ['LOG_SECRET'])) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userUid = process.env.SERVICE_ACCOUNT_USER_UID;
  if (!db || !userUid) {
    console.error('[logMilk] missing Firebase Admin or SERVICE_ACCOUNT_USER_UID');
    res.status(500).json({ error: 'Server is not configured' });
    return;
  }

  const { amountMl, timestamp, note, notes, utcOffsetMinutes } = req.body || {};
  const amount = Number(amountMl);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Invalid amountMl' });
    return;
  }

  try {
    const activity = buildActivityDoc({
      // One baby per account: the baby document id is the user's uid.
      babyId: userUid,
      type: 'feeding',
      timestamp: timestamp ? parseUserTimestamp(timestamp, normalizeOffset(utcOffsetMinutes)) : new Date(),
      details: { foodType: 'milk', amount, notes: notes || note || '' }
    });

    const docRef = db.collection('users').doc(userUid).collection('activities').doc();
    await docRef.set({ ...activity, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    res.status(200).json({ success: true, id: docRef.id, amountMl: activity.details.amount, timestamp: activity.timestamp });
  } catch (err) {
    if (err instanceof ActivityValidationError) {
      res.status(400).json({ error: 'Invalid activity', issues: err.issues });
      return;
    }
    console.error('[logMilk] failed writing activity:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
