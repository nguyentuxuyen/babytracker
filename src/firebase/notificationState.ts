import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './config';

// What the parents already saw in the header bell, kept on the account so a notification
// seen (or a popup closed) on one phone does not show up again on the other devices.
// Stored at users/{uid}/settings/notifications:
//   seen: keys of notifications already opened (the newest MAX_SEEN)
//   days: { name: 'YYYY-MM-DD' } for "done for this day" flags, e.g. dailyReviewSeen
export type SharedNotificationState = {
    seen: string[];
    days: Record<string, string>;
};

export const MAX_SEEN = 30;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const stateDoc = (userId: string) => doc(db, 'users', userId, 'settings', 'notifications');

export const cleanNotificationState = (raw: any): SharedNotificationState => {
    const seen = Array.isArray(raw?.seen) ? raw.seen.filter((key: unknown) => typeof key === 'string') : [];
    const days: Record<string, string> = {};
    if (raw?.days && typeof raw.days === 'object') {
        Object.entries(raw.days).forEach(([name, day]) => {
            if (typeof day === 'string' && DAY_PATTERN.test(day)) days[name] = day;
        });
    }
    return { seen: seen.slice(-MAX_SEEN), days };
};

// Keys from both lists, oldest first, without repeats, capped to the newest MAX_SEEN.
export const mergeSeen = (a: string[], b: string[]) => {
    const merged: string[] = [];
    [...a, ...b].forEach((key) => {
        if (!merged.includes(key)) merged.push(key);
    });
    return merged.slice(-MAX_SEEN);
};

// The later day wins, so a flag set offline is not undone by an older copy on the account.
export const laterDay = (a?: string | null, b?: string | null) => {
    if (!a) return b || null;
    if (!b) return a;
    return a >= b ? a : b;
};

export const subscribeNotificationState = (
    userId: string,
    onChange: (state: SharedNotificationState) => void,
    onError: (error: Error) => void
) => onSnapshot(
    stateDoc(userId),
    (snapshot) => onChange(cleanNotificationState(snapshot.exists() ? snapshot.data() : null)),
    onError
);

export const saveSeenNotifications = (userId: string, seen: string[]) =>
    setDoc(stateDoc(userId), { seen: seen.slice(-MAX_SEEN), updatedAt: serverTimestamp() }, { merge: true });

export const saveNotificationDay = (userId: string, name: string, day: string) =>
    setDoc(stateDoc(userId), { days: { [name]: day }, updatedAt: serverTimestamp() }, { merge: true });
