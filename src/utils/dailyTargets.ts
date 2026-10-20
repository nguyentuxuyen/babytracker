// Checks whether the baby drank enough milk and slept enough on a given day,
// against age-appropriate reference ranges (or the parents' own minimums).
// The reference numbers live in src/domain/dailyTargets.mjs, shared with the server.
import { calculateStatsForDate } from './dailyStats';
import {
    DEFAULT_TARGET_SETTINGS,
    getDailyTargets,
    latestWeightKg,
    type DailyTargetSettings,
    type MilkTarget,
    type SleepTarget,
    type TargetActivity,
    type TargetBaby
} from '../domain/dailyTargets.mjs';

export { DEFAULT_TARGET_SETTINGS, getDailyTargets, latestWeightKg };
export type { DailyTargets, DailyTargetSettings, MilkTarget, SleepTarget, TargetSource } from '../domain/dailyTargets.mjs';

export type ShortfallCheck =
    | { kind: 'milk'; totalMl: number; target: MilkTarget }
    | { kind: 'sleep'; totalMins: number; target: SleepTarget };

/**
 * Milk and sleep shortfalls for `day` (usually yesterday). A type with nothing
 * logged that day is skipped: an empty log more likely means it was not recorded.
 * Sleep counts on the day the baby woke up, like the rest of the app.
 */
export function findShortfalls(
    activities: TargetActivity[],
    baby: TargetBaby,
    day: Date,
    settings: DailyTargetSettings = DEFAULT_TARGET_SETTINGS
): ShortfallCheck[] {
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);
    const targets = getDailyTargets(baby, day, latestWeightKg(activities, endOfDay), settings);
    const stats = calculateStatsForDate(activities as any, day);
    const shortfalls: ShortfallCheck[] = [];

    if (targets.milk && stats.feeding.count > 0 && stats.feeding.totalAmount < targets.milk.minMl) {
        shortfalls.push({ kind: 'milk', totalMl: stats.feeding.totalAmount, target: targets.milk });
    }
    const sleepMins = Math.round(stats.sleep.totalDuration);
    if (stats.sleep.count > 0 && sleepMins < targets.sleep.minHours * 60) {
        shortfalls.push({ kind: 'sleep', totalMins: sleepMins, target: targets.sleep });
    }
    return shortfalls;
}

const SETTINGS_KEY = 'babytracker.dailyTargets';

export const loadTargetSettings = (): DailyTargetSettings => {
    try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (!raw) return DEFAULT_TARGET_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<DailyTargetSettings>;
        const positive = (value: unknown) => (Number(value) > 0 ? Number(value) : null);
        return { milkMinMl: positive(parsed.milkMinMl), sleepMinHours: positive(parsed.sleepMinHours) };
    } catch {
        return DEFAULT_TARGET_SETTINGS;
    }
};

export const saveTargetSettings = (settings: DailyTargetSettings) => {
    try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Private mode or storage full: the setting just lasts for this session.
    }
};

export interface InsightDay {
    date: string;
    milkMl: number;
    milkFeeds: number;
    sleepMinutes: number;
    sleeps: number;
    solidGrams: number;
    solidMeals: number;
    wetDiapers: number;
    stools: number;
}

export interface InsightSummary {
    ageMonths: number;
    weightKg: number | null;
    targets: { milkMinMl: number | null; sleepMinHours: number; sleepMaxHours: number | null };
    days: InsightDay[];
}

const isoDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Per-day totals for the `dayCount` days ending with `lastDay` (oldest first),
 * plus the baby's targets: the numbers sent to the AI for a trend reading.
 * Only counts go out, no notes or names.
 */
export function buildInsightSummary(
    activities: TargetActivity[],
    baby: TargetBaby,
    lastDay: Date,
    settings: DailyTargetSettings = DEFAULT_TARGET_SETTINGS,
    dayCount = 7
): InsightSummary {
    const endOfDay = new Date(lastDay);
    endOfDay.setHours(23, 59, 59, 999);
    const weightKg = latestWeightKg(activities, endOfDay);
    const targets = getDailyTargets(baby, lastDay, weightKg, settings);

    const days: InsightDay[] = [];
    for (let offset = dayCount - 1; offset >= 0; offset--) {
        const day = new Date(lastDay);
        day.setDate(day.getDate() - offset);
        const stats = calculateStatsForDate(activities as any, day);
        days.push({
            date: isoDay(day),
            milkMl: stats.feeding.totalAmount,
            milkFeeds: stats.feeding.count,
            sleepMinutes: Math.round(stats.sleep.totalDuration),
            sleeps: stats.sleep.count,
            solidGrams: stats.solid.totalAmount,
            solidMeals: stats.solid.count,
            wetDiapers: stats.urine.count,
            stools: stats.stool.count
        });
    }

    return {
        ageMonths: Math.round(targets.ageMonths * 10) / 10,
        weightKg: weightKg ? Math.round(weightKg * 10) / 10 : null,
        targets: {
            milkMinMl: targets.milk?.minMl ?? null,
            sleepMinHours: targets.sleep.minHours,
            sleepMaxHours: targets.sleep.maxHours ?? null
        },
        days
    };
}
