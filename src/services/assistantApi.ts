import { auth } from '../firebase/config';
import { AssistantCommand } from './assistantCore';
import type { DailyTargetSettings, InsightSummary } from '../utils/dailyTargets';
import type { DayAssessment, DayTotals } from '../domain/dailyTargets.mjs';
import { firestore } from '../firebase/firestore';
import i18n from '../i18n';

export type AssistantApiResponse = {
    success: boolean;
    tool: string;
    message: string;
    data?: any;
    source: 'local' | 'ai';
    reason: string;
};

const ASSISTANT_ENDPOINT = '/api/mcp';

const isLocalhostRuntime = (): boolean => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
};

// Used only on localhost dev (no Gemini key needed)
const runLocalFallback = async (command: AssistantCommand, userId: string): Promise<AssistantApiResponse> => {
    const { tool, params = {} } = command;

    if (tool === 'create_activity') {
        const saved = await firestore.saveActivity(userId, {
            babyId: userId,
            type: params.activityType || 'feeding',
            timestamp: params.timestamp ? new Date(params.timestamp) : new Date(),
            details: params.details || {}
        } as any);

        return {
            success: true,
            tool,
            message: i18n.t('assistant.api.savedLocal'),
            data: { id: saved.id, activity: saved },
            source: 'local',
            reason: 'local parser matched a supported command'
        };
    }

    if (tool === 'add_food_item') {
        const foodName = String(params.foodName || '').trim();
        if (!foodName) {
            throw new Error(i18n.t('assistant.api.foodNameRequired'));
        }

        const ok = await firestore.addFoodItem(userId, foodName);
        if (!ok) {
            throw new Error(i18n.t('assistant.api.foodAddFailed'));
        }

        return {
            success: true,
            tool,
            message: i18n.t('assistant.api.foodAddedLocal'),
            data: { foodName },
            source: 'local',
            reason: 'local parser matched a supported command'
        };
    }

    throw new Error(i18n.t('assistant.api.unsupportedTool', { tool }));
};

export const executeAssistantCommand = async (
    command: AssistantCommand,
    options?: { selectedDate?: Date; babyId?: string }
): Promise<AssistantApiResponse> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error(i18n.t('assistant.loginRequired'));
    }

    const shouldUseLocalParsing = isLocalhostRuntime() || command.tool !== 'unknown';

    // On localhost: skip Gemini, use local regex parse result directly
    if (shouldUseLocalParsing) {
        const localResult = await runLocalFallback(command, currentUser.uid);
        return {
            ...localResult,
            source: 'local',
            reason: isLocalhostRuntime() ? 'localhost runtime uses local parsing only' : 'local parser matched a supported command'
        };
    }

    const token = await currentUser.getIdToken();

    // Send raw text to server; Gemini parses it there. Dates go as the user's local
    // calendar day plus the UTC offset so the server (UTC) can place times correctly.
    const selected = options?.selectedDate ?? new Date();
    const body = {
        text: command.rawText,
        selectedDate: `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`,
        utcOffsetMinutes: -new Date().getTimezoneOffset()
    };

    const response = await fetch(ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    // 404 means endpoint not deployed yet — fall back gracefully
    if (response.status === 404) {
        const localResult = await runLocalFallback(command, currentUser.uid);
        return {
            ...localResult,
            source: 'local',
            reason: 'AI endpoint unavailable; local fallback used'
        };
    }

    let payload: any = {};
    try {
        payload = await response.json();
    } catch {
        throw new Error(i18n.t('assistant.api.invalidResponse', { status: response.status }));
    }

    if (!response.ok) {
        // Surface the real error to the UI — no silent swallowing
        const detail = payload?.details ? ` — ${payload.details}` : '';
        throw new Error(`${payload?.error ?? i18n.t('assistant.api.serverError')}${detail} (HTTP ${response.status})`);
    }

    return {
        ...payload,
        source: 'ai',
        reason: 'input was too complex for local parsing; sent to AI fallback'
    } as AssistantApiResponse;
};

/** Ask the AI for a short reading of the last days' milk and sleep numbers. */
export const requestDailyInsight = async (summary: InsightSummary, language: string): Promise<string> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error(i18n.t('assistant.loginRequired'));
    }
    const token = await currentUser.getIdToken();
    const response = await fetch(ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'daily_insight', summary, language })
    });

    let payload: any = {};
    try {
        payload = await response.json();
    } catch {
        throw new Error(i18n.t('assistant.api.invalidResponse', { status: response.status }));
    }
    if (!response.ok || !payload?.message) {
        if (payload?.code === 'AI_QUOTA_EXCEEDED') throw new Error(i18n.t('yesterdayCheck.aiQuota'));
        throw new Error(i18n.t('yesterdayCheck.aiFailed'));
    }
    return String(payload.message);
};

export interface DailyReview {
    /** Reviewed day (yesterday), YYYY-MM-DD. */
    day: string;
    /** "empty" when nothing was logged that day. */
    status: 'done' | 'empty';
    language: string | null;
    headline: string;
    facts: {
        ageMonths: number;
        targets: { milkMinMl: number | null; sleepMinHours: number; sleepMaxHours: number | null; solidMinMeals: number | null };
        yesterday: DayTotals;
        status: DayAssessment;
        /** Milk by kind; reviews written before kinds were recorded do not have it. */
        milkByType?: Partial<Record<'breast' | 'formula' | 'unspecified', { feeds: number; ml: number }>>;
        milkProduct?: string | null;
        solidFoods?: Array<{ name: string; meals: number; grams: number; reaction: string; newThisWeek: boolean }>;
        weekFoods?: Array<{ name: string; days: number }>;
    } | null;
    /** Null when the AI was unavailable; the headline is then the app's own summary. */
    ai: { headline: string; milk: string; solids: string; sleep: string; tips: string[] } | null;
}

const postReviewAction = async (body: Record<string, unknown>) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error(i18n.t('assistant.loginRequired'));
    }
    const token = await currentUser.getIdToken();
    const response = await fetch(ASSISTANT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...body, utcOffsetMinutes: -new Date().getTimezoneOffset() })
    });

    let payload: any = {};
    try {
        payload = await response.json();
    } catch {
        throw new Error(i18n.t('assistant.api.invalidResponse', { status: response.status }));
    }
    if (!response.ok || !payload?.success) {
        throw new Error(i18n.t(payload?.code === 'AI_UNAVAILABLE' ? 'dailyReview.rewriteFailed' : 'dailyReview.failed'));
    }
    return payload;
};

/**
 * Yesterday's morning review. With `generate`, the server writes it now if it
 * does not exist yet (and notifies the family's phones in the morning).
 * With `rewriteDay`, it writes that past day's review again from the current log.
 */
export const fetchDailyReview = async (options: {
    generate?: boolean;
    retryAi?: boolean;
    rewriteDay?: string;
    settings?: DailyTargetSettings;
    language: string;
}): Promise<DailyReview | null> => {
    const payload = await postReviewAction({
        action: 'daily_review',
        generate: options.generate === true,
        retryAi: options.retryAi === true,
        ...(options.rewriteDay ? { rewriteDay: options.rewriteDay } : {}),
        settings: options.settings,
        language: options.language
    });
    return payload.review ?? null;
};

/** Written reviews, newest day first. */
export const fetchDailyReviewHistory = async (): Promise<DailyReview[]> => {
    const payload = await postReviewAction({ action: 'daily_review_history' });
    return Array.isArray(payload.reviews) ? payload.reviews : [];
};
