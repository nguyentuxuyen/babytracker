const { admin, db } = require('./_admin');

// Gemini calls per user per UTC day.
const DAILY_AI_LIMIT = Number(process.env.ASSISTANT_DAILY_LIMIT) > 0 ? Number(process.env.ASSISTANT_DAILY_LIMIT) : 100;

// Count this call against the user's daily quota; false when the quota is used up.
async function consumeAiQuota(uid) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection('users').doc(uid).collection('usage').doc('assistant');
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.exists ? snapshot.data() : {};
    const count = data.day === day ? Number(data.count) || 0 : 0;
    if (count >= DAILY_AI_LIMIT) return false;
    transaction.set(ref, { day, count: count + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return true;
  });
}

module.exports = { consumeAiQuota, DAILY_AI_LIMIT };
