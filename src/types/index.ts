export interface Baby {
    id: string;
    name: string;
    birthDate: Date;
    dueDate?: Date; // Expected date of birth, important for Wonder Weeks
    gender: 'male' | 'female';
    birthWeight: number; // in grams
    birthHeight: number; // in centimeters
    avatarUrl?: string;
}

// Base interfaces for activity details
interface BaseActivityDetails {
    notes?: string;
}

interface FeedingDetails extends BaseActivityDetails {
    amount: number; // in ml
}

interface DiaperChangeDetails extends BaseActivityDetails {
    isUrine: boolean;
    isStool: boolean;
    stoolShape?: 'watery' | 'soft' | 'formed' | 'normal';
    stoolColor?: 'yellow' | 'brown' | 'green' | 'black';
}

interface SleepDetails extends BaseActivityDetails {
    duration: number; // in minutes
}

interface BathDetails extends BaseActivityDetails {
    // No specific fields other than notes
}

interface MeasurementDetails extends BaseActivityDetails {
    height?: number; // in centimeters
    weight?: number; // in grams
    temperature?: number; // in Celsius
}

interface MemoDetails extends BaseActivityDetails {
    notes: string; // notes is mandatory for memo
}

interface DailyRatingDetails extends BaseActivityDetails {
    rating: number; // 1-5 stars
    notes?: string; // optional notes about the day
}

// Discriminated Union for Activities
export type Activity = 
    | { id: string; babyId: string; type: 'feeding'; timestamp: Date; details: FeedingDetails }
    | { id: string; babyId: string; type: 'diaper'; timestamp: Date; details: DiaperChangeDetails }
    | { id: string; babyId: string; type: 'sleep'; timestamp: Date; details: SleepDetails }
    | { id: string; babyId: string; type: 'bath'; timestamp: Date; details: BathDetails }
    | { id: string; babyId: string; type: 'measurement'; timestamp: Date; details: MeasurementDetails }
    | { id: string; babyId: string; type: 'memo'; timestamp: Date; details: MemoDetails }
    | { id: string; babyId: string; type: 'dailyRating'; timestamp: Date; details: DailyRatingDetails };
