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

import type {
    FeedingDetails,
    SleepDetails,
    DiaperDetails,
    MeasurementDetails,
    NotesDetails,
    DailyRatingDetails
} from '../domain/activitySchema.mjs';

export type {
    ActivityType,
    FeedingDetails,
    SleepDetails,
    DiaperDetails,
    MeasurementDetails,
    NotesDetails,
    DailyRatingDetails
} from '../domain/activitySchema.mjs';

// Activity as the app uses it. Firestore documents are built and read through
// src/domain/activitySchema.mjs, which is the source of truth for this shape.
// Details are Partial so screens can build them field by field; the schema fills defaults.
type ActivityBase = { id: string; babyId: string; timestamp: Date };

export type Activity =
    | (ActivityBase & { type: 'feeding'; details: Partial<FeedingDetails> })
    | (ActivityBase & { type: 'diaper'; details: Partial<DiaperDetails> })
    | (ActivityBase & { type: 'sleep'; details: Partial<SleepDetails> })
    | (ActivityBase & { type: 'bath'; details: Partial<NotesDetails> })
    | (ActivityBase & { type: 'measurement'; details: Partial<MeasurementDetails> })
    | (ActivityBase & { type: 'memo'; details: Partial<NotesDetails> })
    | (ActivityBase & { type: 'dailyRating'; details: Partial<DailyRatingDetails> });

export interface ChangelogRelease {
    version: string;
    releasedAt: Date;
    title: string;
    summary?: string;
    changes: string[];
    isPublished: boolean;
}

export interface ChangelogConfig {
    currentVersion: string;
    minSupportedVersion?: string;
    updatedAt?: Date;
}
