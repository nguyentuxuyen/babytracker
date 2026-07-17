import { auth } from '../firebase/config';
import { AssistantCommand } from './assistantCore';
import { firestore } from '../firebase/firestore';

export type AssistantApiResponse = {
    success: boolean;
    tool: string;
    message: string;
    data?: any;
};

const ASSISTANT_ENDPOINT = '/api/mcp';

const isLocalhostRuntime = (): boolean => {
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1';
};

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
            message: 'Đã ghi hoạt động mới (fallback local)',
            data: { id: saved.id, activity: saved }
        };
    }

    if (tool === 'add_food_item') {
        const foodName = String(params.foodName || '').trim();
        if (!foodName) {
            throw new Error('Missing foodName');
        }

        const ok = await firestore.addFoodItem(userId, foodName);
        if (!ok) {
            throw new Error('Không thể thêm món ăn');
        }

        return {
            success: true,
            tool,
            message: 'Đã thêm món mới (fallback local)',
            data: { foodName }
        };
    }

    throw new Error(`Tool chưa được hỗ trợ ở fallback local: ${tool}`);
};

export const executeAssistantCommand = async (command: AssistantCommand): Promise<AssistantApiResponse> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error('Bạn cần đăng nhập để dùng AI assistant');
    }

    if (isLocalhostRuntime()) {
        return runLocalFallback(command, currentUser.uid);
    }

    const token = await currentUser.getIdToken();
    try {
        const response = await fetch(ASSISTANT_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(command)
        });

        if (response.status === 404) {
            return runLocalFallback(command, currentUser.uid);
        }

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(payload.error || payload.message || 'Không thể thực thi lệnh AI');
        }

        return payload as AssistantApiResponse;
    } catch (error) {
        // Nếu API không reachable ở local/dev, fallback về client firestore để tính năng vẫn dùng được.
        return runLocalFallback(command, currentUser.uid);
    }
};
