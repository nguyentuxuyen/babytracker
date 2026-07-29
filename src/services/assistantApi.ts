import { auth } from '../firebase/config';
import { AssistantCommand } from './assistantCore';
import { firestore } from '../firebase/firestore';

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
            babyId: params.babyId || userId,
            type: params.activityType || 'feeding',
            timestamp: params.timestamp ? new Date(params.timestamp) : new Date(),
            details: params.details || {}
        } as any);

        return {
            success: true,
            tool,
            message: '記録を保存しました（ローカルモード）',
            data: { id: saved.id, activity: saved },
            source: 'local',
            reason: 'local parser matched a supported command'
        };
    }

    if (tool === 'add_food_item') {
        const foodName = String(params.foodName || '').trim();
        if (!foodName) {
            throw new Error('食品名が必要です');
        }

        const ok = await firestore.addFoodItem(userId, foodName);
        if (!ok) {
            throw new Error('食品を追加できませんでした');
        }

        return {
            success: true,
            tool,
            message: '食品を追加しました（ローカルモード）',
            data: { foodName },
            source: 'local',
            reason: 'local parser matched a supported command'
        };
    }

    throw new Error(`未対応のツール: ${tool}`);
};

export const executeAssistantCommand = async (
    command: AssistantCommand,
    options?: { selectedDate?: Date; babyId?: string }
): Promise<AssistantApiResponse> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error('AIアシスタントを使うにはログインが必要です');
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

    // Send raw text to server; Gemini parses it there
    const body = {
        text: command.rawText,
        selectedDate: options?.selectedDate?.toISOString() ?? new Date().toISOString(),
        babyId: options?.babyId ?? command.params?.babyId ?? currentUser.uid,
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
        throw new Error(`サーバーから無効なレスポンスが返されました (HTTP ${response.status})`);
    }

    if (!response.ok) {
        // Surface the real error to the UI — no silent swallowing
        const detail = payload?.details ? ` — ${payload.details}` : '';
        throw new Error(`${payload?.error ?? 'サーバーエラー'}${detail} (HTTP ${response.status})`);
    }

    return {
        ...payload,
        source: 'ai',
        reason: 'input was too complex for local parsing; sent to AI fallback'
    } as AssistantApiResponse;
};
