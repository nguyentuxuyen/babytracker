export type ActivityType = 'feeding' | 'sleep' | 'diaper' | 'bath' | 'measurement' | 'memo' | 'dailyRating';

export type FoodPreference = 'enthusiastic' | 'normal' | 'dislike' | 'allergic';
export type StoolConsistency = 'lỏng' | 'bình thường' | 'khô';

export interface FeedingDetails {
    foodType: 'milk' | 'solid';
    /** ml for milk, g for solid food; 0 when not given. */
    amount: number;
    notes: string;
    foodItem?: string;
    foodPreference?: FoodPreference;
    isAllergic?: boolean;
}

export interface SleepDetails {
    /** Minutes. The activity timestamp is the wake-up time. */
    duration: number;
    notes: string;
}

export interface DiaperDetails {
    isUrine: boolean;
    isStool: boolean;
    stoolColor: string[];
    stoolConsistency?: StoolConsistency;
    notes: string;
}

export interface MeasurementDetails {
    /** grams */
    weight?: number;
    /** cm */
    height?: number;
    /** °C */
    temperature?: number;
    notes: string;
}

export interface NotesDetails {
    notes: string;
}

export interface DailyRatingDetails {
    rating: number;
    notes: string;
}

export type ActivityDetailsByType = {
    feeding: FeedingDetails;
    sleep: SleepDetails;
    diaper: DiaperDetails;
    bath: NotesDetails;
    measurement: MeasurementDetails;
    memo: NotesDetails;
    dailyRating: DailyRatingDetails;
};

export interface ActivityInput {
    babyId: string;
    type: string;
    timestamp: unknown;
    details?: Record<string, unknown>;
}

export interface ActivityDoc {
    babyId: string;
    type: ActivityType;
    timestamp: Date;
    details: Record<string, any>;
    schemaVersion: number;
}

export interface NormalizedActivity {
    id: string;
    babyId: string;
    type: string;
    timestamp: Date;
    details: Record<string, any>;
}

export declare const SCHEMA_VERSION: number;
export declare const ACTIVITY_TYPES: ActivityType[];
export declare const LIMITS: {
    amount: number;
    duration: number;
    weight: number;
    height: number;
    temperatureMin: number;
    temperatureMax: number;
};

export declare class ActivityValidationError extends Error {
    code: 'ACTIVITY_INVALID';
    issues: string[];
    constructor(message: string, issues?: string[]);
}

export declare function normalizeActivityType(value: unknown): ActivityType | null;
export declare function toDate(value: unknown): Date | null;
export declare function normalizeDetails(type: string, details: unknown): Record<string, any>;
export declare function buildActivityDoc(input: ActivityInput): ActivityDoc;
export declare function normalizeActivityRecord(id: string, data: unknown, fallbackBabyId?: string): NormalizedActivity | null;
