export type TargetSource = 'weight' | 'age' | 'custom';

export interface DailyTargetSettings {
    /** Parent-set minimum milk per day in ml; null uses the reference range. */
    milkMinMl: number | null;
    /** Parent-set minimum sleep per day in hours; null uses the reference range. */
    sleepMinHours: number | null;
}

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

export interface SolidsTarget {
    minMeals: number;
}

export interface DailyTargets {
    ageMonths: number;
    milk: MilkTarget | null;
    sleep: SleepTarget;
    /** Null before 6 months, when solids are not expected yet. */
    solids: SolidsTarget | null;
}

export interface TargetActivity {
    type: string;
    timestamp: Date;
    details?: any;
}

export interface TargetBaby {
    birthDate: Date;
    gender?: 'male' | 'female';
}

export interface DayTotals {
    milkMl: number;
    milkFeeds: number;
    solidGrams: number;
    solidMeals: number;
    sleepMinutes: number;
    sleeps: number;
    wetDiapers: number;
    stools: number;
}

export type DayStatus = 'ok' | 'low' | 'high' | 'notLogged' | 'notApplicable';

export interface DayAssessment {
    milk: DayStatus;
    solids: DayStatus;
    sleep: DayStatus;
}

export declare const DEFAULT_TARGET_SETTINGS: DailyTargetSettings;
export declare function latestWeightKg(activities: TargetActivity[], on: Date): number | null;
export declare function targetsForAgeDays(
    ageDays: number,
    gender: 'male' | 'female' | undefined,
    weightKg: number | null,
    settings?: DailyTargetSettings
): DailyTargets;
export declare function getDailyTargets(
    baby: TargetBaby,
    on: Date,
    weightKg: number | null,
    settings?: DailyTargetSettings
): DailyTargets;
export declare function summarizeDay(activities: TargetActivity[]): DayTotals;
export declare function assessDay(totals: DayTotals, targets: DailyTargets): DayAssessment;
