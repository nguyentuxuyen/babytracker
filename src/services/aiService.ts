// Placeholder AI service - not functional

// Lightweight on-device AI helpers (heuristic-based) suitable for local analysis
// This file is intentionally self-contained and doesn't call any external APIs.
// It's easy to swap out or extend to call an external LLM later (OpenAI, etc.).

export type DailySummary = {
    totalFeedings: number;
    totalFeedingAmountMl?: number; // optional aggregate feeding amount in ml
    totalDiapers: number;
    wetDiapers?: number;
    dirtyDiapers?: number;
    totalSleepMinutes: number;
    avgTemperature?: number;
    weightKg?: number;
    heightCm?: number;
    notes?: string;
};

export type AnalyzeResult = {
    suggestions: string[];
    flags: string[]; // short machine-friendly flags
};

export const generateDailySummary = (activities: any[]): DailySummary => {
    const summary: DailySummary = {
        totalFeedings: 0,
        totalFeedingAmountMl: 0,
        totalDiapers: 0,
        wetDiapers: 0,
        dirtyDiapers: 0,
        totalSleepMinutes: 0,
        notes: ''
    };

    activities.forEach((a: any) => {
        const type = (a.type || '').toLowerCase();
        const details = a.details || {};
        if (type.includes('feeding') || type === 'sua' || type === 'sữa') {
            summary.totalFeedings = (summary.totalFeedings || 0) + 1;
            const amount = Number(details.amount || details.ml || details.volume || 0) || 0;
            summary.totalFeedingAmountMl = (summary.totalFeedingAmountMl || 0) + amount;
        }
        if (type.includes('diaper') || type.includes('napas') || type.includes('tã') || type.includes('diaper')) {
            summary.totalDiapers = (summary.totalDiapers || 0) + 1;
            const diaperType = (details.kind || details.type || '').toLowerCase();
            if (diaperType.includes('wet') || diaperType.includes('urine') || diaperType.includes('nước') || diaperType.includes('nước tiểu')) {
                summary.wetDiapers = (summary.wetDiapers || 0) + 1;
            } else if (diaperType.includes('dirty') || diaperType.includes('stool') || diaperType.includes('phân')) {
                summary.dirtyDiapers = (summary.dirtyDiapers || 0) + 1;
            }
        }
        if (type.includes('sleep') || type === 'ngủ' || type === 'ngu') {
            const minutes = Number(details.durationMinutes || details.minutes || details.duration || 0) || 0;
            summary.totalSleepMinutes = (summary.totalSleepMinutes || 0) + minutes;
        }
        if (details.temperature) {
            summary.avgTemperature = Number(details.temperature) || summary.avgTemperature;
        }
        if (details.weight) {
            summary.weightKg = Number(details.weight) || summary.weightKg;
        }
        if (details.height) {
            summary.heightCm = Number(details.height) || summary.heightCm;
        }
        if (details.notes) {
            summary.notes = (summary.notes || '') + '\n' + details.notes;
        }
    });

    return summary;
};

export const analyzeActivities = (summary: DailySummary): AnalyzeResult => {
    const suggestions: string[] = [];
    const flags: string[] = [];

    // Feeding heuristics
    if ((summary.totalFeedings || 0) < 6) {
        suggestions.push('Số lần cho ăn hôm nay khá thấp — theo dõi tần suất cho ăn trong vài ngày.');
        flags.push('low_feedings');
    }
    if ((summary.totalFeedingAmountMl || 0) > 0 && (summary.totalFeedingAmountMl || 0) < 300) {
        suggestions.push('Tổng lượng sữa hôm nay nhỏ, có thể cần đánh giá lượng ăn mỗi lần nếu bé vẫn đói.');
        flags.push('low_feeding_volume');
    }

    // Diapers
    if ((summary.totalDiapers || 0) < 4) {
        suggestions.push('Số tã thay thấp — nếu tiếp tục, theo dõi mực nước/đi tiểu của bé.');
        flags.push('low_diapers');
    }
    if ((summary.dirtyDiapers || 0) > 0) {
        suggestions.push('Đã có phân trong tã — bình thường, theo dõi màu và tần suất.');
    }

    // Sleep
    if ((summary.totalSleepMinutes || 0) < 600) { // < 10 hours
        suggestions.push('Tổng giấc ngủ hôm nay thấp hơn mức mong đợi — đảm bảo bé có chu kỳ ngủ ổn định.');
        flags.push('low_sleep');
    }

    // Temperature
    if ((summary.avgTemperature || 0) >= 38) {
        suggestions.push('Nhiệt độ trung bình cao (>=38°C). Nếu bé có dấu hiệu khác, cân nhắc liên hệ bác sĩ.');
        flags.push('fever');
    }

    // Weight/Height notes
    if (summary.weightKg && summary.weightKg < 3.0) {
        suggestions.push('Cân nặng thấp — kiểm tra lộ trình tăng cân với bác sĩ nhi khoa.');
        flags.push('low_weight');
    }

    if (suggestions.length === 0) {
        suggestions.push('Không có cảnh báo rõ rệt. Tiếp tục theo dõi và duy trì lịch chăm sóc.');
        flags.push('ok');
    }

    return { suggestions, flags };
};