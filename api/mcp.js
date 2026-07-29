const { db, admin, adminInitError } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');
const { parseWithGemini } = require('./gemini');

const toDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const sendError = (res, status, error, extra = {}) => {
  res.status(status).json({ success: false, error, ...extra });
};

/**
 * Execute a resolved { tool, params } command against Firestore.
 * Shared by both the Gemini path and the legacy { tool, params } path.
 */
async function executeTool(tool, params, uid, res) {
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
      message: '記録を保存しました',
      data: { id: docRef.id, activity }
    });
    return true;
  }

  if (tool === 'add_food_item') {
    const foodName = String(params.foodName || '').trim();
    if (!foodName) {
      sendError(res, 400, '食品名が必要です');
      return true;
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
      message: `「${foodName}」をメニューに追加しました`,
      data: { foodName }
    });
    return true;
  }

  if (tool === 'unknown') {
    sendError(res, 422, 'AIが入力内容を理解できませんでした。別の言い方で試してください。', {
      code: 'TOOL_UNKNOWN'
    });
    return true;
  }

  return false; // unknown tool
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  if (!db) {
    sendError(res, 500, 'Server Firebase is not configured', {
      code: 'FIREBASE_ADMIN_NOT_CONFIGURED',
      details: adminInitError ? adminInitError.message : 'Unknown Firebase Admin init error'
    });
    return;
  }

  try {
    const decoded = await verifyUserFromRequest(req);
    const uid = decoded.uid;
    const body = req.body || {};

    console.log('[mcp] request', { uid, hasText: !!body.text, tool: body.tool ?? null });
    // ── Gemini path: client sends { text, selectedDate, babyId } ──────────────
    if (typeof body.text === 'string') {
      const selectedDate = body.selectedDate || new Date().toISOString();
      console.log('[mcp] calling Gemini for:', body.text.slice(0, 100));
      const parsed = await parseWithGemini(body.text, selectedDate);
      console.log('[mcp] Gemini parsed:', parsed);

      // Inject babyId if not returned by Gemini
      if (!parsed.params.babyId && body.babyId) {
        parsed.params.babyId = body.babyId;
      }

      const handled = await executeTool(parsed.tool, parsed.params, uid, res);
      if (!handled) {
        sendError(res, 400, `未対応のツール: ${parsed.tool}`);
      }
      return;
    }

    // ── Legacy path: client sends { tool, params } (localhost fallback) ────────
    const { tool, params = {} } = body;
    if (!tool) {
      sendError(res, 400, 'リクエストに "text" または "tool" フィールドが必要です');
      return;
    }

    const handled = await executeTool(tool, params, uid, res);
    if (!handled) {
      sendError(res, 400, `未対応のツール: ${tool}`);
    }

  } catch (error) {
    console.error('[mcp] unhandled error', { code: error?.code, message: error?.message });
    const code = error && error.code ? error.code : '';

    const authCodes = new Set([
      'AUTH_HEADER_MISSING',
      'auth/id-token-expired',
      'auth/id-token-revoked',
      'auth/argument-error',
      'auth/invalid-id-token'
    ]);

    if (authCodes.has(code)) {
      sendError(res, 401, 'トークンが無効または期限切れです', { code });
      return;
    }

    if (code === 'GEMINI_NOT_CONFIGURED') {
      sendError(res, 500, 'Gemini APIキーが設定されていません', { code });
      return;
    }

    if (code === 'GEMINI_API_ERROR' || code === 'GEMINI_PARSE_ERROR' || code === 'GEMINI_SCHEMA_ERROR') {
      sendError(res, 502, `Geminiエラー: ${error.message}`, { code });
      return;
    }

    sendError(res, 500, 'サーバー内部エラー', {
      code: code || 'MCP_INTERNAL_ERROR',
      details: error && error.message ? error.message : String(error)
    });
  }
};

