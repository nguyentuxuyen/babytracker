const { db, admin } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');

const toDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const sendError = (res, status, error, extra = {}) => {
  res.status(status).json({ success: false, error, ...extra });
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  try {
    const decoded = await verifyUserFromRequest(req);
    const uid = decoded.uid;
    const { tool, params = {} } = req.body || {};

    if (!tool) {
      sendError(res, 400, 'Missing tool name');
      return;
    }

    if (tool === 'create_activity') {
      const activityType = params.activityType || 'feeding';
      const timestamp = toDate(params.timestamp);
      const details = params.details || {};
      const babyId = params.babyId || uid;

      const docRef = db.collection('users').doc(uid).collection('activities').doc();
      const activity = {
        babyId,
        type: activityType,
        timestamp,
        details,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await docRef.set(activity);

      res.status(200).json({
        success: true,
        tool,
        message: 'Đã ghi hoạt động mới',
        data: { id: docRef.id, activity }
      });
      return;
    }

    if (tool === 'add_food_item') {
      const foodName = String(params.foodName || '').trim();
      if (!foodName) {
        sendError(res, 400, 'Missing foodName');
        return;
      }

      const babyDocRef = db.collection('babies').doc(uid);
      const babySnap = await babyDocRef.get();
      const existingItems = babySnap.exists && Array.isArray(babySnap.data().foodMenu)
        ? babySnap.data().foodMenu
        : [];

      if (!existingItems.includes(foodName)) {
        await babyDocRef.set({
          foodMenu: [...existingItems, foodName],
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }

      res.status(200).json({
        success: true,
        tool,
        message: 'Đã thêm món mới',
        data: { foodName }
      });
      return;
    }

    sendError(res, 400, `Unsupported tool: ${tool}`);
  } catch (error) {
    console.error('mcp handler error:', error);
    sendError(res, 401, 'Unauthorized or invalid request');
  }
};
