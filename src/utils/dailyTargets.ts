// Checks whether the baby drank enough milk and slept enough on a given day,
// against age-appropriate reference ranges (or the parents' own minimums).
import { calculateStatsForDate } from './dailyStats';
import { WHO_WEIGHT_BOYS, WHO_WEIGHT_GIRLS, GrowthStandard } from './growthStandards';

interface TargetActivity {
    type: string;
    timestamp: Date;
    details?: any;
}

interface TargetBaby {
    birthDate: Date;
    gender?: 'male' | 'female';
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_DAYS = 30.44;

// Milk intake ramps up during the first two weeks, so no milk check before that.
const MILK_CHECK_FROM_DAYS = 14;
// Bottle-fed babies under 6 months take about 150 ml/kg/day (AAP: ~2.5 oz per lb),
// and should not need more than ~960 ml (32 oz). Warn below 80% of that.
const MILK_ML_PER_KG = 150;
const MILK_MAX_ML = 960;
const MILK_LOW_RATIO = 0.8;

// Once solids start, milk is still the main drink: NHS suggests ~600 ml at 7–9 months,
// ~400 ml at 10–12 months, and 350–400 ml of milk a day for toddlers.
const MILK_MIN_BY_MONTH: Array<{ fromMonth: number; minMl: number }> = [
    { fromMonth: 12, minMl: 300 },
    { fromMonth: 9, minMl: 400 },
    { fromMonth: 6, minMl: 500 }
];

// Total sleep per 24 h, including naps (National Sleep Foundation 2015 for 0–3 months,
// American Academy of Sleep Medicine 2016 from 4 months).
const SLEEP_HOURS_BY_MONTH: Array<{ fromMonth: number; minHours: number; maxHours: number }> = [
    { fromMonth: 36, minHours: 10, maxHours: 13 },
    { fromMonth: 12, minHours: 11, maxHours: 14 },
    { fromMonth: 4, minHours: 12, maxHours: 16 },
    { fromMonth: 0, minHours: 14, maxHours: 17 }
];

export type TargetSource = 'weight' | 'age' | 'custom';

export interface DailyTargetSettings {
    /** Parent-set minimum milk per day in ml; null uses the reference range. */
    milkMinMl: number | null;
    /** Parent-set minimum sleep per day in hours; null uses the reference range. */
    sleepMinHours: number | null;
}

export const DEFAULT_TARGET_SETTINGS: DailyTargetSettings = { milkMinMl: null, sleepMinHours: null };

export interface MilkTarget {
    minMl: number;
    source: TargetSource;
    /** Weight the target was computed from, in kg (only for source "weight"). */
    weightKg?: number;
}

export interface SleepTarget {
    minHours: number;
    /** Upper end of the reference range (not set for custom targets). */
    maxHours?: number;
    source: TargetSource;
}

export interface DailyTargets {
    ageMonths: number;
    milk: MilkTarget | null;
    sleep: SleepTarget;
}

export type ShortfallCheck =
    | { kind: 'milk'; totalMl: number; target: MilkTarget }
    | { kind: 'sleep'; totalMins: number; target: SleepTarget };

const ageInDays = (birthDate: Date, on: Date) =>
    Math.floor((startOfDay(on).getTime() - startOfDay(new Date(birthDate)).getTime()) / DAY_MS);

function startOfDay(date: Date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}

// Linear interpolation of the WHO median weight for the age, in kg.
function medianWeightKg(table: GrowthStandard[], ageMonths: number) {
    if (ageMonths <= table[0].month) return table[0].median;
    for (let i = 1; i < table.length; i++) {
        const prev = table[i - 1];
        const next = table[i];
        if (ageMonths <= next.month) {
            const ratio = (ageMonths - prev.month) / (next.month - prev.month);
            return prev.median + (next.median - prev.median) * ratio;
        }
    }
    return table[table.length - 1].median;
}

/** Latest weight (kg) measured on or before `on`, or null if there is none. */
export function latestWeightKg(activities: TargetActivity[], on: Date): number | null {
    const latest = activities
        .filter((a) => a.type === 'measurement' && Number(a.details?.weight) > 0 && new Date(a.timestamp).getTime() <= on.getTime())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    return latest ? Number(latest.details.weight) / 1000 : null;
}

export function getDailyTargets(
    baby: TargetBaby,
    on: Date,
    weightKg: number | null,
    settings: DailyTargetSettings = DEFAULT_TARGET_SETTINGS
): DailyTargets {
    const days = Math.max(0, ageInDays(baby.birthDate, on));
    const ageMonths = days / MONTH_DAYS;

    let milk: MilkTarget | null = null;
    if (settings.milkMinMl && settings.milkMinMl > 0) {
        milk = { minMl: Math.round(settings.milkMinMl), source: 'custom' };
    } else if (days >= MILK_CHECK_FROM_DAYS) {
        const byAge = MILK_MIN_BY_MONTH.find((row) => ageMonths >= row.fromMonth);
        if (byAge) {
            milk = { minMl: byAge.minMl, source: 'age' };
        } else {
            const measured = weightKg && weightKg > 0;
            const kg = measured
                ? weightKg
                : medianWeightKg(baby.gender === 'female' ? WHO_WEIGHT_GIRLS : WHO_WEIGHT_BOYS, ageMonths);
            const typical = Math.min(MILK_MAX_ML, kg * MILK_ML_PER_KG);
            // Round down to 10 ml so the shown target looks like a real bottle amount.
            const minMl = Math.floor((typical * MILK_LOW_RATIO) / 10) * 10;
            milk = measured
                ? { minMl, source: 'weight', weightKg: Math.round(kg * 10) / 10 }
                : { minMl, source: 'age' };
        }
    }

    const range = SLEEP_HOURS_BY_MONTH.find((row) => ageMonths >= row.fromMonth) || SLEEP_HOURS_BY_MONTH[SLEEP_HOURS_BY_MONTH.length - 1];
    const sleep: SleepTarget = settings.sleepMinHours && settings.sleepMinHours > 0
        ? { minHours: settings.sleepMinHours, source: 'custom' }
        : { minHours: range.minHours, maxHours: range.maxHours, source: 'age' };

    return { ageMonths, milk, sleep };
}

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
