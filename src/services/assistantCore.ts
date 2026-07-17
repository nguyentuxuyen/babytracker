export type AssistantTool = 'create_activity' | 'add_food_item' | 'unknown';

export type AssistantCommand = {
    rawText: string;
    tool: AssistantTool;
    confidence: number;
    needsConfirmation: boolean;
    missingFields: string[];
    params: Record<string, any>;
    preview: string;
};

export type AssistantQuestionContext = {
    babyAge?: number;
    recentActivities?: {
        totalSleepMinutes?: number;
    };
};

const normalizeText = (value: string) => value.trim().toLowerCase();

const parseClockTime = (input: string): { hours: number; minutes: number } | null => {
    const match = input.match(/(\d{1,2})(?::|h|\.)(\d{2})/i);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return { hours, minutes };
};

const buildTimestamp = (baseDate: Date, timeText?: string): Date => {
    const timestamp = new Date(baseDate);
    if (!timeText) {
        timestamp.setSeconds(0, 0);
        return timestamp;
    }

    const parsedTime = parseClockTime(timeText);
    if (parsedTime) {
        timestamp.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    } else {
        timestamp.setSeconds(0, 0);
    }

    return timestamp;
};

export const parseAssistantCommand = (
    input: string,
    options?: { selectedDate?: Date; babyId?: string }
): AssistantCommand => {
    const rawText = input.trim();
    const normalized = normalizeText(rawText);
    const selectedDate = options?.selectedDate ? new Date(options.selectedDate) : new Date();

    const feedingKeywords = ['bú', 'uống sữa', 'cho ăn', 'ăn sữa', 'feeding'];
    const foodKeywords = ['món mới', 'thêm món', 'thêm thực phẩm', 'food'];

    const amountMatch = rawText.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|mL|ML)?/i);
    const timeMatch = rawText.match(/(\d{1,2}(?::\d{2}|h\d{2}|\.\d{2}))/i);

    if (foodKeywords.some((keyword) => normalized.includes(keyword))) {
        const foodName = rawText
            .replace(/(thêm món|thêm thực phẩm|món mới|food)/gi, '')
            .trim();

        return {
            rawText,
            tool: 'add_food_item',
            confidence: foodName ? 0.8 : 0.5,
            needsConfirmation: true,
            missingFields: foodName ? [] : ['foodName'],
            params: {
                foodName
            },
            preview: foodName ? `Thêm món mới: ${foodName}` : 'Thêm món ăn mới vào danh sách'
        };
    }

    if (feedingKeywords.some((keyword) => normalized.includes(keyword)) || normalized.includes('ml')) {
        const timeText = timeMatch ? timeMatch[1] : '';
        const timestamp = buildTimestamp(selectedDate, timeText);
        const amount = amountMatch ? Number(String(amountMatch[1]).replace(',', '.')) : undefined;

        return {
            rawText,
            tool: 'create_activity',
            confidence: amount ? 0.88 : 0.62,
            needsConfirmation: false,
            missingFields: amount ? [] : ['amount'],
            params: {
                activityType: 'feeding',
                babyId: options?.babyId,
                timestamp: timestamp.toISOString(),
                details: {
                    amount,
                    notes: rawText,
                    foodType: 'milk'
                }
            },
            preview: amount
                ? `Ghi cữ bú ${amount}ml${timeText ? ` lúc ${timeText}` : ''}`
                : 'Ghi cữ bú mới'
        };
    }

    return {
        rawText,
        tool: 'unknown',
        confidence: 0.1,
        needsConfirmation: false,
        missingFields: [],
        params: {},
        preview: 'Chưa hiểu rõ yêu cầu'
    };
};
