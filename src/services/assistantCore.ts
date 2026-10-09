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
    // Minutes need two digits so "12.5" is not read as 12:05.
    const hourMinuteMatch = text.match(/(?:^|\D)([01]?\d|2[0-3])\s*(?::|h|\.|時)\s*([0-5]\d)(?!\d)/i);
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
    const hourOnlyMatch = text.match(/(?:^|\D)([01]?\d|2[0-3])\s*(?:giờ|gio|h|時(?!間))(?!\d)/i);
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

// When the command names no time, use the current time of day on the selected date.
// A named time later than "now" on today's date means yesterday ("bú 23h" said at 1:00).
const buildTimestamp = (
    baseDate: Date,
    parsedTime: { hours: number; minutes: number } | null,
    now: Date
): Date => {
    const timestamp = new Date(baseDate);
    if (!parsedTime) {
        timestamp.setHours(now.getHours(), now.getMinutes(), 0, 0);
        return timestamp;
    }
    timestamp.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
    const isToday = timestamp.toDateString() === now.toDateString();
    if (isToday && timestamp.getTime() - now.getTime() > 5 * 60 * 1000) {
        timestamp.setDate(timestamp.getDate() - 1);
    }
    return timestamp;
};

// Whole-word match for space-separated languages; substring match for Japanese.
const hasKeyword = (text: string, keywords: string[]): boolean => {
    const padded = ` ${text.split(/[\s.,!?;:()/]+/).filter(Boolean).join(' ')} `;
    return keywords.some((keyword) => (/^[\u3040-\u30ff\u4e00-\u9fff]/.test(keyword)
        ? text.includes(keyword)
        : padded.includes(` ${keyword} `)));
};

const parseDurationMinutes = (text: string): number | undefined => {
    const hoursMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(tiếng|tieng|hours?|hrs?|時間)/i);
    const minutesMatch = /時\s*\d+\s*分/.test(text)
        ? null
        : text.match(/(\d+)\s*(phút|phut|min|mins|minutes|minute|p|分)(?![a-zà-ỹ])/i);
    if (!hoursMatch && !minutesMatch) return undefined;
    const hours = hoursMatch ? Number(hoursMatch[1].replace(',', '.')) : 0;
    const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
    const total = Math.round(hours * 60 + minutes);
    return total > 0 ? total : undefined;
};

const STOOL_PATTERN = /(^|[\s,.])(ị|đi ị|phân|poop|stool)($|[\s,.])|うんち|うんこ|便/;
const URINE_PATTERN = /(^|[\s,.])(tè|đi tè|tiểu|pee|urine)($|[\s,.])|おしっこ|尿/;

export const parseAssistantCommand = (
    input: string,
    options?: { selectedDate?: Date; babyId?: string; now?: Date }
): AssistantCommand => {
    const rawText = input.trim();
    const normalized = normalizeText(rawText);
    const now = options?.now ? new Date(options.now) : new Date();
    const selectedDate = options?.selectedDate ? new Date(options.selectedDate) : now;

    const feedingKeywords = ['bú', 'uống sữa', 'cho ăn', 'ăn sữa', 'feeding', 'bú sữa', 'sữa', 'ăn cháo', 'ăn cơm', 'ăn mì', 'ăn bánh', 'milk', 'ミルク', '授乳', '母乳'];
    const foodKeywords = ['món mới', 'thêm món', 'thêm thực phẩm', 'thêm đồ ăn', 'thêm thức ăn', 'add food'];
    const diaperKeywords = ['đổi bỉm', 'thay bỉm', 'bỉm', 'đổi tã', 'thay tã', 'đổi tả', 'thay tả', 'tã', 'diaper', 'おむつ', 'オムツ', 'おしっこ', 'うんち', 'ị', 'đi ị', 'tè', 'đi tè'];
    const sleepKeywords = ['ngủ', 'sleep', 'đi ngủ', 'ngủ trưa', '寝', '睡眠', '昼寝', 'ねんね'];

    const amountMatch = rawText.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
    const amount = amountMatch ? Number(String(amountMatch[1]).replace(',', '.')) : undefined;
    const parsedTime = parseClockTime(rawText);

    if (hasKeyword(normalized, foodKeywords)) {
        const foodName = rawText
            .replace(/(thêm món|thêm thực phẩm|món mới|thêm đồ ăn|thêm thức ăn|add food)/gi, '')
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

    if (hasKeyword(normalized, diaperKeywords)) {
        const isStool = STOOL_PATTERN.test(normalized);
        const isUrine = URINE_PATTERN.test(normalized) || !isStool;
        return {
            rawText,
            tool: 'create_activity',
            confidence: 0.85,
            needsConfirmation: false,
            missingFields: [],
            params: {
                activityType: 'diaper',
                babyId: options?.babyId,
                timestamp: buildTimestamp(selectedDate, parsedTime, now).toISOString(),
                details: {
                    isUrine,
                    isStool,
                    notes: rawText
                }
            },
            preview: 'Ghi thay bỉm mới'
        };
    }

    // A volume in ml always means a feeding, even if the sentence also mentions sleep.
    if (amount === undefined && hasKeyword(normalized, sleepKeywords)) {
        const duration = parseDurationMinutes(normalized);
        // Sleep timestamps are the wake-up time: a named time is when the sleep started.
        const start = parsedTime ? buildTimestamp(selectedDate, parsedTime, now) : null;
        const end = start && duration
            ? new Date(start.getTime() + duration * 60 * 1000)
            : (start || buildTimestamp(selectedDate, null, now));
        return {
            rawText,
            tool: 'create_activity',
            confidence: 0.83,
            needsConfirmation: false,
            missingFields: duration ? [] : ['duration'],
            params: {
                activityType: 'sleep',
                babyId: options?.babyId,
                timestamp: end.toISOString(),
                details: {
                    duration: duration || 0,
                    notes: rawText
                }
            },
            preview: duration ? `Ghi ngủ ${duration} phút` : 'Ghi ngủ mới'
        };
    }

    if (amount !== undefined || hasKeyword(normalized, feedingKeywords)) {
        const timeLabel = parsedTime ? formatClockTime(parsedTime.hours, parsedTime.minutes) : '';

        return {
            rawText,
            tool: 'create_activity',
            confidence: amount ? 0.88 : 0.62,
            needsConfirmation: false,
            missingFields: amount ? [] : ['amount'],
            params: {
                activityType: 'feeding',
                babyId: options?.babyId,
                timestamp: buildTimestamp(selectedDate, parsedTime, now).toISOString(),
                details: {
                    amount: amount || 0,
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
