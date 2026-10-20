const { db, admin } = require('./_admin');
const { verifyUserFromRequest } = require('./_auth');
const { parseWithGemini, analyzeDailyTrends, sanitizeInsightSummary } = require('./gemini');
const { loadSchema, isActivityValidationError } = require('./_schema');
const { parseUserTimestamp, formatLocalIso, normalizeOffset } = require('./_time');
const { consumeAiQuota } = require('./_quota');
const { getDailyReview, generateDailyReview, saveTargetSettings, localDay, WAKE_FROM_HOUR, UNTIL_HOUR } = require('./_dailyReview');

const MAX_TEXT_LENGTH = 300;
const MAX_FOOD_NAME_LENGTH = 100;

const sendError = (res, status, error, extra = {}) => {
  res.status(status).json({ success: false, error, ...extra });
};

/**
 * Execute a resolved { tool, params } command against Firestore.
 * Activities always go to the caller's own account and through the shared schema.
 */
async function executeTool(tool, params, uid, utcOffsetMinutes, res) {
  if (tool === 'create_activity') {
    const { buildActivityDoc } = await loadSchema();
    const timestamp = params.timestamp ? parseUserTimestamp(params.timestamp, utcOffsetMinutes) : new Date();
    const activity = buildActivityDoc({
      // One baby per account: the baby document id is the user's uid.
      babyId: uid,
      type: params.activityType,
      timestamp,
      details: params.details
    });

    const docRef = db.collection('users').doc(uid).collection('activities').doc();
    await docRef.set({ ...activity, createdAt: admin.firestore.FieldValue.serverTimestamp() });

    res.status(200).json({
      success: true,
      tool,
      message: '記録を保存しました',
      data: { id: docRef.id, activity }
    });
    return true;
  }

  if (tool === 'add_food_item') {
    const foodName = String(params.foodName || '').trim().slice(0, MAX_FOOD_NAME_LENGTH);
    if (!foodName) {
      sendError(res, 400, '食品名が必要です');
      return true;
    }

    const babyDocRef = db.collection('babies').doc(uid);
    const babySnap = await babyDocRef.get();
    const existingItems = babySnap.exists && Array.isArray(babySnap.data().foodMenu)
      ? babySnap.data().foodMenu
      : [];

    const exists = existingItems.some((item) => String(item).toLocaleLowerCase() === foodName.toLocaleLowerCase());
    if (!exists) {
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
    console.error('[mcp] Firebase Admin is not configured');
    sendError(res, 500, 'Server Firebase is not configured', { code: 'FIREBASE_ADMIN_NOT_CONFIGURED' });
    return;
  }

  try {
    const decoded = await verifyUserFromRequest(req);
    const uid = decoded.uid;
    const body = req.body || {};
    const utcOffsetMinutes = normalizeOffset(body.utcOffsetMinutes);

    // ── Insight path: client sends { action: 'daily_insight', summary, language } ──
    if (body.action === 'daily_insight') {
      const summary = sanitizeInsightSummary(body.summary);
      if (!summary) {
        sendError(res, 400, 'summary.days is required', { code: 'SUMMARY_INVALID' });
        return;
      }
      if (!(await consumeAiQuota(uid))) {
        sendError(res, 429, '本日のAI入力の上限に達しました', { code: 'AI_QUOTA_EXCEEDED' });
        return;
      }
      const language = ['vi', 'en', 'ja'].includes(body.language) ? body.language : 'vi';
      const message = await analyzeDailyTrends(summary, language);
      res.status(200).json({ success: true, tool: 'daily_insight', message });
      return;
    }

    // ── Morning review of yesterday: { action: 'daily_review', generate?, retryAi?, settings?, language } ──
    if (body.action === 'daily_review') {
      // The parents' own minimums live on the device; keep a copy for the morning cron.
      if (body.settings) await saveTargetSettings(uid, body.settings);
      const options = { utcOffsetMinutes, language: body.language };
      const existing = await getDailyReview(uid, options);
      const retryAi = body.retryAi === true && existing && existing.status === 'done' && !existing.ai;
      if ((existing && !retryAi) || body.generate !== true) {
        res.status(200).json({ success: true, tool: 'daily_review', review: existing });
        return;
      }
      // Opening the app in the morning notifies the other parent's phone too; later in the day it does not.
      const { hour } = localDay(Date.now(), utcOffsetMinutes);
      const { review } = await generateDailyReview(uid, {
        ...options,
        trigger: 'app',
        push: hour >= WAKE_FROM_HOUR && hour < UNTIL_HOUR,
        retryAi
      });
      res.status(200).json({ success: true, tool: 'daily_review', review });
      return;
    }

    // ── Gemini path: client sends { text, selectedDate, utcOffsetMinutes } ────
    if (typeof body.text === 'string') {
      const text = body.text.trim();
      if (!text || text.length > MAX_TEXT_LENGTH) {
        sendError(res, 400, `入力は1〜${MAX_TEXT_LENGTH}文字にしてください`, { code: 'TEXT_LENGTH' });
        return;
      }
      if (!(await consumeAiQuota(uid))) {
        sendError(res, 429, '本日のAI入力の上限に達しました', { code: 'AI_QUOTA_EXCEEDED' });
        return;
      }

      const now = new Date();
      const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.selectedDate || ''))
        ? body.selectedDate
        : formatLocalIso(now, utcOffsetMinutes).slice(0, 10);
      const parsed = await parseWithGemini(text, { selectedDate, now: formatLocalIso(now, utcOffsetMinutes) });

      const handled = await executeTool(parsed.tool, parsed.params, uid, utcOffsetMinutes, res);
      if (!handled) {
        sendError(res, 400, `未対応のツール: ${parsed.tool}`);
      }
      return;
    }

    // ── Direct path: client sends an already-parsed { tool, params } ─────────
    const { tool, params = {} } = body;
    if (!tool) {
      sendError(res, 400, 'リクエストに "text" または "tool" フィールドが必要です');
      return;
    }

    const handled = await executeTool(tool, params, uid, utcOffsetMinutes, res);
    if (!handled) {
      sendError(res, 400, `未対応のツール: ${tool}`);
    }

  } catch (error) {
    const code = error && error.code ? error.code : '';
    console.error('[mcp] error', { code, message: error?.message });

    if (isActivityValidationError(error)) {
      sendError(res, 422, 'AIの解析結果が記録の形式に合いませんでした。別の言い方で試してください。', {
        code,
        issues: error.issues
      });
      return;
    }

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

    if (typeof code === 'string' && code.startsWith('GEMINI_')) {
      sendError(res, 502, 'AIサービスでエラーが発生しました。しばらくしてから再試行してください。', { code });
      return;
    }

    sendError(res, 500, 'サーバー内部エラー', { code: code || 'MCP_INTERNAL_ERROR' });
  }
};
