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
    const text = normalizeText(input);

    // Matches 21:30, 21h30, 21.30, 21時30
    const hourMinuteMatch = text.match(/(?:^|\D)([01]?\d|2[0-3])\s*(?::|h|\.|時)\s*([0-5]?\d)(?!\d)/i);
    if (hourMinuteMatch) {
        const hours = Number(hourMinuteMatch[1]);
        const minutes = Number(hourMinuteMatch[2]);
        if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            return { hours, minutes };
        }
    }

    // Matches contextual time after words like "luc/luc/at": luc 21, lúc 21:30, vao 22h15
    const contextualTimeMatch = text.match(/(?:lúc|luc|vào|vao|at|tai|tại)\s*([01]?\d|2[0-3])(?:\s*(?::|h|\.|時)\s*([0-5]?\d))?(?!\d)/i);
    if (contextualTimeMatch) {
        const hours = Number(contextualTimeMatch[1]);
        const minutes = contextualTimeMatch[2] !== undefined ? Number(contextualTimeMatch[2]) : 0;
        if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
            return { hours, minutes };
        }
    }

    // Matches hour-only formats: 21h, 21 giờ, 21 gio, 21時
    const hourOnlyMatch = text.match(/(?:^|\D)([01]?\d|2[0-3])\s*(?:giờ|gio|h|時)(?!\d)/i);
    if (hourOnlyMatch) {
        const hours = Number(hourOnlyMatch[1]);
        if (!Number.isNaN(hours)) {
            return { hours, minutes: 0 };
        }
    }

    // Matches bare trailing hour in feeding commands: "bé bú 100ml 21"
    const trailingHourMatch = text.match(/(?:^|\D)([01]?\d|2[0-3])\s*$/);
    if (trailingHourMatch) {
        const hours = Number(trailingHourMatch[1]);
        if (!Number.isNaN(hours)) {
            return { hours, minutes: 0 };
        }
    }

    return null;
};

const formatClockTime = (hours: number, minutes: number): string => {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const buildTimestamp = (baseDate: Date, parsedTime?: { hours: number; minutes: number } | null): Date => {
    const timestamp = new Date(baseDate);
    if (!parsedTime) {
        timestamp.setSeconds(0, 0);
        return timestamp;
    }

    timestamp.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);

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

    const amountMatch = rawText.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);

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
        const parsedTime = parseClockTime(rawText);
        const timeLabel = parsedTime ? formatClockTime(parsedTime.hours, parsedTime.minutes) : '';
        const timestamp = buildTimestamp(selectedDate, parsedTime);
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
                ? `Ghi cữ bú ${amount}ml${timeLabel ? ` lúc ${timeLabel}` : ''}`
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
