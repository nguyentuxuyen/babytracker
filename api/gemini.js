/**
 * Gemini REST API wrapper for baby activity parsing.
 *
 * Sends a natural-language sentence and context to Gemini and returns a
 * structured { tool, params, preview } object ready for mcp.js to execute.
 *
 * Environment variable required:
 *   GEMINI_API_KEY  — Google AI Studio key
 */

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `
あなたは赤ちゃんの育児記録アシスタントです。
ユーザーの自然文を解析し、以下のJSONスキーマに従って純粋なJSONのみを返してください。
Markdownのコードブロック（\`\`\`json）や余分なテキストは一切含めないでください。

利用可能なツール:

1. create_activity — 育児活動を記録する
   params:
     activityType: "feeding" | "sleep" | "diaper" | "bath" | "measurement" | "memo"
     timestamp: ISO 8601形式の文字列、必ずユーザーのタイムゾーンのオフセット付き (例: "2026-07-23T09:15:00+09:00")
       時刻の指定がなければ「現在時刻」を使う。睡眠は目が覚めた時刻を timestamp にする。
     details (activityTypeに応じて):
       feeding  → { amount: number (ml), foodType: "milk"|"solid", foodItem?: string, notes?: string }
       sleep    → { duration: number (分), notes?: string }
       diaper   → { isUrine: boolean, isStool: boolean, notes?: string }
       bath     → { notes?: string }
       measurement → { weight?: number (g), height?: number (cm), temperature?: number (°C), notes?: string }
       memo     → { notes: string }

2. add_food_item — 離乳食メニューに食品を追加する
   params:
     foodName: string

判断できない場合:
   tool: "unknown"
   params: {}
   preview: "理解できなかった内容の説明"

レスポンス形式:
{
  "tool": "...",
  "params": { ... },
  "preview": "実行内容の日本語説明"
}
`.trim();

/**
 * @param {string} text - Raw user input
 * @param {{ selectedDate: string, now: string }} context - selected day (YYYY-MM-DD) and the
 *   current time, both in the user's time zone ("2026-10-09T14:20:00+09:00")
 * @returns {Promise<{ tool: string, params: object, preview: string }>}
 */
async function parseWithGemini(text, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { code: 'GEMINI_NOT_CONFIGURED' });
  }

  const userMessage = `
現在時刻: ${context.now}
選択中の日付: ${context.selectedDate} (時刻の指定がなければこの日付の現在時刻)
ユーザーの入力: ${text}
`.trim();

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMessage}` }]
      }
    ],
    generationConfig: {
      temperature: 0.1,      // low temperature → deterministic structured output
      maxOutputTokens: 512,
      responseMimeType: 'application/json'
    }
  };

  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(requestBody)
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[gemini] API error', res.status, errBody.slice(0, 300));
    throw Object.assign(
      new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 200)}`),
      { code: 'GEMINI_API_ERROR' }
    );
  }

  const data = await res.json();

  // Extract text from Gemini response structure
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  if (!rawText) {
    throw Object.assign(new Error('Gemini returned an empty response'), { code: 'GEMINI_EMPTY_RESPONSE' });
  }

  // Strip markdown fences if Gemini ignores responseMimeType hint
  const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw Object.assign(
      new Error(`Gemini returned non-JSON: ${cleaned.slice(0, 200)}`),
      { code: 'GEMINI_PARSE_ERROR' }
    );
  }

  if (!parsed.tool || !parsed.params) {
    throw Object.assign(
      new Error('Gemini response missing required fields (tool, params)'),
      { code: 'GEMINI_SCHEMA_ERROR' }
    );
  }

  return {
    tool: String(parsed.tool),
    params: parsed.params ?? {},
    preview: String(parsed.preview ?? '')
  };
}

const INSIGHT_LANGUAGES = { vi: 'Vietnamese', en: 'English', ja: 'Japanese' };
const MAX_INSIGHT_DAYS = 14;

const clampNumber = (value, max) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.round(number * 10) / 10, max);
};

/**
 * Keep only the numbers the insight prompt needs, so nothing else the client
 * sends ends up in the prompt. Returns null when there is no day to analyse.
 */
function sanitizeInsightSummary(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) return null;
  const days = raw.days
    .filter((day) => day && /^\d{4}-\d{2}-\d{2}$/.test(String(day.date)))
    .slice(-MAX_INSIGHT_DAYS)
    .map((day) => ({
      date: String(day.date),
      milkMl: clampNumber(day.milkMl, 5000),
      milkFeeds: clampNumber(day.milkFeeds, 50),
      sleepMinutes: clampNumber(day.sleepMinutes, 1440),
      sleeps: clampNumber(day.sleeps, 50),
      solidGrams: clampNumber(day.solidGrams, 5000),
      solidMeals: clampNumber(day.solidMeals, 20),
      wetDiapers: clampNumber(day.wetDiapers, 50),
      stools: clampNumber(day.stools, 50)
    }));
  if (days.length === 0) return null;

  const targets = raw.targets && typeof raw.targets === 'object' ? raw.targets : {};
  return {
    ageMonths: clampNumber(raw.ageMonths, 120),
    weightKg: raw.weightKg ? clampNumber(raw.weightKg, 50) : null,
    targets: {
      milkMinMl: targets.milkMinMl ? clampNumber(targets.milkMinMl, 5000) : null,
      sleepMinHours: clampNumber(targets.sleepMinHours, 24),
      sleepMaxHours: targets.sleepMaxHours ? clampNumber(targets.sleepMaxHours, 24) : null
    },
    days
  };
}

function buildInsightPrompt(summary, language) {
  const languageName = INSIGHT_LANGUAGES[language] || INSIGHT_LANGUAGES.vi;
  return `
You help parents read their baby's daily log. Below is a JSON summary of the last days
(milk in ml, sleep in minutes counted on the day the baby woke up, solid food in grams, diapers).
"targets" are the app's reference minimums for this baby's age and weight.

Write 3 to 5 short bullet points in ${languageName}, plain text, each starting with "• ":
- what changed in milk and sleep compared with the previous days, with numbers;
- whether yesterday (the last day) is an outlier or part of a trend;
- one or two practical, gentle suggestions.
Days with zero for a type may just be unlogged; say so instead of assuming the baby did not eat or sleep.
Do not diagnose. If the numbers are clearly worrying for several days, suggest asking a doctor.

Data:
${JSON.stringify(summary)}
`.trim();
}

/**
 * Ask Gemini for a short, plain-text reading of the last days of the log.
 * @param {ReturnType<typeof sanitizeInsightSummary>} summary
 * @param {string} language - "vi" | "en" | "ja"
 * @returns {Promise<string>}
 */
async function analyzeDailyTrends(summary, language) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { code: 'GEMINI_NOT_CONFIGURED' });
  }

  const res = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: buildInsightPrompt(summary, language) }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
    })
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.error('[gemini] insight API error', res.status, errBody.slice(0, 300));
    throw Object.assign(new Error(`Gemini API error ${res.status}`), { code: 'GEMINI_API_ERROR' });
  }

  const data = await res.json();
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
  if (!text) {
    throw Object.assign(new Error('Gemini returned an empty response'), { code: 'GEMINI_EMPTY_RESPONSE' });
  }
  return text;
}

module.exports = { parseWithGemini, analyzeDailyTrends, sanitizeInsightSummary, buildInsightPrompt };
