/**
 * Gemini REST API wrapper for baby activity parsing.
 *
 * Sends a natural-language sentence and context to Gemini and returns a
 * structured { tool, params, preview } object ready for mcp.js to execute.
 *
 * Environment variable required:
 *   GEMINI_API_KEY  — Google AI Studio key
 */

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = `
あなたは赤ちゃんの育児記録アシスタントです。
ユーザーの自然文を解析し、以下のJSONスキーマに従って純粋なJSONのみを返してください。
Markdownのコードブロック（\`\`\`json）や余分なテキストは一切含めないでください。

利用可能なツール:

1. create_activity — 育児活動を記録する
   params:
     activityType: "feeding" | "sleep" | "diaper" | "bath" | "measurement" | "memo"
     timestamp: ISO 8601形式の文字列 (例: "2026-07-23T09:15:00.000+09:00")
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
 * @param {string} text      - Raw user input
 * @param {string} selectedDate - ISO string of the currently selected date
 * @returns {Promise<{ tool: string, params: object, preview: string }>}
 */
async function parseWithGemini(text, selectedDate) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { code: 'GEMINI_NOT_CONFIGURED' });
  }

  const userMessage = `
選択中の日付: ${selectedDate}
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

  const url = `${GEMINI_ENDPOINT}?key=${apiKey}`;
  console.log('[gemini] sending request, text length:', text.length);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  console.log('[gemini] raw response:', rawText.slice(0, 300));
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

module.exports = { parseWithGemini };
