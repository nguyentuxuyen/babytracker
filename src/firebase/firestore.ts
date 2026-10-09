import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    getDocs, 
    deleteDoc, 
    updateDoc,
    query, 
    orderBy,
    serverTimestamp,
    limit,
    where,
    Timestamp,
    QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from './config';
import { Baby, Activity, ChangelogConfig, ChangelogRelease } from '../types';
import { getCurrentUser } from './auth';
import { moveFoodItemToEnd } from '../utils/foodSearch';
import { buildActivityDoc, normalizeActivityRecord } from '../domain/activitySchema';

const changelogRootPath = ['app_meta', 'changelog'] as const;

const toDateValue = (value: unknown): Date | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
        return ((value as { toDate: () => Date }).toDate());
    }
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

// Older versions kept unsent activities in localStorage. New writes go through
// Firestore's own offline cache instead; this queue is only drained.
type QueuedActivity = {
    localId: string;
    userId: string;
    activity: Record<string, any>;
    queuedAt: string;
    attempts: number;
    lastError?: string;
};

const getQueueStorageKey = (userId: string) => `offline-activity-queue:${userId}`;

const normalizeFoodName = (value: unknown): string => String(value || '').trim();

const mergeFoodItems = (items: unknown[]): string[] => {
    const merged = new Map<string, string>();
    items.forEach((item) => {
        const name = normalizeFoodName(item);
        const key = name.toLocaleLowerCase();
        if (name && !merged.has(key)) {
            merged.set(key, name);
        }
    });
    return Array.from(merged.values());
};

const emitQueueUpdated = () => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('offline-queue-updated'));
    }
};

const getQueuedActivities = (userId: string): QueuedActivity[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(getQueueStorageKey(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Error reading offline queue:', error);
        return [];
    }
};

const saveQueuedActivities = (userId: string, queue: QueuedActivity[]) => {
    if (typeof window === 'undefined') return;
    try {
        if (queue.length === 0) {
            window.localStorage.removeItem(getQueueStorageKey(userId));
        } else {
            window.localStorage.setItem(getQueueStorageKey(userId), JSON.stringify(queue));
        }
        emitQueueUpdated();
    } catch (error) {
        console.error('Error saving offline queue:', error);
    }
};

const removeQueuedActivities = (userId: string, localIds: string[]) => {
    if (localIds.length === 0) return;
    const remove = new Set(localIds);
    // Re-read so items added by another tab meanwhile are kept.
    saveQueuedActivities(userId, getQueuedActivities(userId).filter((item) => !remove.has(item.localId)));
};

const queuedAsActivities = (userId: string, from?: Date, to?: Date): Activity[] =>
    (getQueuedActivities(userId)
        .map((queued) => normalizeActivityRecord(queued.localId, queued.activity, userId))
        .filter((activity) => !!activity
            && (!from || activity.timestamp >= from)
            && (!to || activity.timestamp < to))) as Activity[];

const byNewestFirst = (left: Activity, right: Activity) => right.timestamp.getTime() - left.timestamp.getTime();

const toActivities = (docs: QueryDocumentSnapshot[], userId: string): Activity[] =>
    (docs
        .map((activityDoc) => normalizeActivityRecord(activityDoc.id, activityDoc.data(), userId))
        .filter(Boolean)) as Activity[];

// How long saveActivity waits for the server before treating a write as pending.
// The write is already in Firestore's local cache and is sent when the network returns.
const WRITE_ACK_TIMEOUT_MS = 4000;

// Ids of saved activities the server has not confirmed yet.
const pendingWriteIds = new Set<string>();

let syncInFlight: Promise<{ synced: number; failed: number }> | null = null;

// Full-history reads (Stats, Food history) are cached briefly so switching
// between pages does not download every activity again. Any write clears it.
const HISTORY_CACHE_TTL_MS = 2 * 60 * 1000;
let historyCache: { key: string; at: number; result: Promise<Activity[]> } | null = null;
const invalidateHistoryCache = () => {
    historyCache = null;
};

export const firestore = {
    // Get baby data by user email (compatible with existing Firebase data structure)
    getBabyByEmail: async (email: string): Promise<Baby | null> => {
        try {
            console.log('🔍 Searching for baby data with email:', email);
            
            // Query only the legacy document matching this email.
            const babiesRef = collection(db, 'babies');
            const q = query(babiesRef, where('mail', '==', email), limit(1));
            const querySnapshot = await getDocs(q);

            const matchingDoc = querySnapshot.docs[0];
            if (!matchingDoc) {
                console.log('❌ No baby data found for email:', email);
                return null;
            }

            const data = matchingDoc.data();
            return {
                id: matchingDoc.id,
                name: data.name || '',
                birthDate: data.birthDate ? data.birthDate.toDate() : new Date(),
                dueDate: data.dueDate ? data.dueDate.toDate() : undefined,
                gender: data.gender || 'male',
                birthWeight: data.birthWeight || 0,
                birthHeight: data.birthHeight || 0,
                avatarUrl: data.avatarUrl || ''
            };
        } catch (error) {
            console.error('❌ Error getting baby data by email:', error);
            return null;
        }
    },

    // Get baby data by user UID (following security rules: /babies/{userId})
    getBabyByUserId: async (userId: string): Promise<Baby | null> => {
        try {
            const docRef = doc(db, 'babies', userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    name: data.name,
                    birthDate: data.birthDate.toDate(), // Convert Firestore Timestamp to Date
                    dueDate: data.dueDate ? data.dueDate.toDate() : undefined,
                    gender: data.gender,
                    birthWeight: data.birthWeight,
                    birthHeight: data.birthHeight,
                    avatarUrl: data.avatarUrl || ''
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error getting baby data:', error);
            return null;
        }
    },
    
    // Save baby data with email field (compatible with existing structure)
    saveBabyDataWithEmail: async (email: string, babyData: Baby, userUid: string): Promise<boolean> => {
        try {
            console.log('💾 Saving baby data with email:', email, 'userUid:', userUid);
            
            // Use user UID as document ID to comply with security rules
            const docRef = doc(db, 'babies', userUid);
            const isNew = !(await getDoc(docRef)).exists();
            
            await setDoc(docRef, {
                name: babyData.name,
                birthDate: babyData.birthDate,
                dueDate: babyData.dueDate || null,
                gender: babyData.gender,
                birthWeight: babyData.birthWeight,
                birthHeight: babyData.birthHeight,
                avatarUrl: babyData.avatarUrl || '',
                mail: email, // Important: save email field for compatibility
                updatedAt: serverTimestamp(),
                ...(isNew ? { createdAt: serverTimestamp() } : {})
            }, { merge: true });
            
            console.log('✅ Successfully saved baby data');
            return true;
        } catch (error) {
            console.error('❌ Error saving baby data with email:', error);
            return false;
        }
    },

    // Migrate existing baby data to user's UID document
    migrateBabyDataToUID: async (email: string, userUid: string): Promise<boolean> => {
        try {
            console.log('🔄 Migrating baby data from email to UID...');
            
            // First, find existing baby data by email
            const existingBaby = await firestore.getBabyByEmail(email);
            
            if (existingBaby) {
                console.log('📦 Found existing baby data, migrating...');
                
                // Save to new document with user UID
                const success = await firestore.saveBabyDataWithEmail(email, existingBaby, userUid);
                
                if (success) {
                    console.log('✅ Migration successful');
                    // Note: We keep the old document for backup
                }
                
                return success;
            } else {
                console.log('❌ No existing baby data found to migrate');
                return false;
            }
        } catch (error) {
            console.error('❌ Error migrating baby data:', error);
            return false;
        }
    },

    // Save baby data under user UID (following security rules: /babies/{userId})
    saveBabyData: async (userId: string, babyData: Baby): Promise<boolean> => {
        try {
            const docRef = doc(db, 'babies', userId);
            const isNew = !(await getDoc(docRef)).exists();
            await setDoc(docRef, {
                name: babyData.name,
                birthDate: babyData.birthDate,
                dueDate: babyData.dueDate || null,
                gender: babyData.gender,
                birthWeight: babyData.birthWeight,
                birthHeight: babyData.birthHeight,
                avatarUrl: babyData.avatarUrl || '',
                updatedAt: serverTimestamp(),
                ...(isNew ? { createdAt: serverTimestamp() } : {})
            }, { merge: true });
            
            return true;
        } catch (error) {
            console.error('Error saving baby data:', error);
            return false;
        }
    },

    getChangelogConfig: async (): Promise<ChangelogConfig | null> => {
        try {
            const configRef = doc(db, changelogRootPath[0], changelogRootPath[1], 'meta', 'current');
            const configSnap = await getDoc(configRef);

            if (!configSnap.exists()) {
                return null;
            }

            const data = configSnap.data();
            if (!data.currentVersion) {
                return null;
            }

            return {
                currentVersion: String(data.currentVersion),
                minSupportedVersion: data.minSupportedVersion ? String(data.minSupportedVersion) : undefined,
                updatedAt: toDateValue(data.updatedAt)
            };
        } catch (error) {
            console.error('Error getting changelog config:', error);
            return null;
        }
    },

    getPublishedChangelogReleases: async (maxItems: number = 10): Promise<ChangelogRelease[]> => {
        try {
            const releasesRef = collection(db, changelogRootPath[0], changelogRootPath[1], 'releases');
            const q = query(releasesRef, where('isPublished', '==', true), orderBy('releasedAt', 'desc'), limit(maxItems));
            const querySnapshot = await getDocs(q);

            return querySnapshot.docs
                .map((releaseDoc) => {
                    const data = releaseDoc.data();
                    const releasedAt = toDateValue(data.releasedAt);
                    if (!data.version || !releasedAt || !data.title) {
                        return null;
                    }

                    return {
                        version: String(data.version),
                        releasedAt,
                        title: String(data.title),
                        summary: data.summary ? String(data.summary) : undefined,
                        changes: Array.isArray(data.changes) ? data.changes.map((item: unknown) => String(item)) : [],
                        isPublished: Boolean(data.isPublished)
                    } as ChangelogRelease;
                })
                .filter((release): release is ChangelogRelease => Boolean(release));
        } catch (error) {
            console.error('Error getting changelog releases:', error);
            return [];
        }
    },
    
    // Activities from the last `daysToLoad` days, newest first (users/{userId}/activities).
    getActivities: async (userId: string, daysToLoad: number = 3650): Promise<Activity[]> => {
        const key = `${userId}:${daysToLoad}`;
        if (historyCache && historyCache.key === key && Date.now() - historyCache.at < HISTORY_CACHE_TTL_MS) {
            return historyCache.result;
        }
        const result = firestore.loadActivities(userId, daysToLoad);
        historyCache = { key, at: Date.now(), result };
        result.catch(invalidateHistoryCache);
        return result;
    },

    loadActivities: async (userId: string, daysToLoad: number): Promise<Activity[]> => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToLoad);
        try {
            const q = query(
                collection(db, 'users', userId, 'activities'),
                where('timestamp', '>=', Timestamp.fromDate(cutoffDate)),
                orderBy('timestamp', 'desc'),
                limit(5000)
            );
            const snapshot = await getDocs(q);
            return [...toActivities(snapshot.docs, userId), ...queuedAsActivities(userId, cutoffDate)].sort(byNewestFirst);
        } catch (error) {
            console.error('Error getting activities:', error);
            return queuedAsActivities(userId, cutoffDate).sort(byNewestFirst);
        }
    },

    getActivitiesByDate: async (userId: string, date: Date): Promise<Activity[]> => {
        return firestore.getActivitiesByDateRange(userId, date, 1);
    },

    // Activities of `days` calendar days ending on `date` (local time), newest first.
    getActivitiesByDateRange: async (userId: string, date: Date, days: number = 2): Promise<Activity[]> => {
        const startOfRange = new Date(date);
        startOfRange.setHours(0, 0, 0, 0);
        startOfRange.setDate(startOfRange.getDate() - (days - 1));
        const endOfRange = new Date(date);
        endOfRange.setHours(0, 0, 0, 0);
        endOfRange.setDate(endOfRange.getDate() + 1);
        try {
            const q = query(
                collection(db, 'users', userId, 'activities'),
                where('timestamp', '>=', Timestamp.fromDate(startOfRange)),
                where('timestamp', '<', Timestamp.fromDate(endOfRange)),
                orderBy('timestamp', 'desc'),
                limit(200 * days)
            );
            const snapshot = await getDocs(q);
            return [...toActivities(snapshot.docs, userId), ...queuedAsActivities(userId, startOfRange, endOfRange)]
                .sort(byNewestFirst);
        } catch (error) {
            console.error('Error getting activities by date range:', error);
            return queuedAsActivities(userId, startOfRange, endOfRange).sort(byNewestFirst);
        }
    },

    // True while the server has not confirmed this activity yet (offline or slow network).
    isPendingWrite: (activityId: string): boolean =>
        pendingWriteIds.has(activityId) || activityId.startsWith('offline-'),

    /**
     * Save an activity in the canonical shape (src/domain/activitySchema.js).
     * Throws ActivityValidationError for invalid input. When the server does not
     * answer quickly (offline), the activity stays in Firestore's local cache, is
     * synced automatically later, and isPendingWrite(id) is true until then.
     */
    saveActivity: async (userId: string, activity: Omit<Activity, 'id'>): Promise<Activity> => {
        const built = buildActivityDoc(activity as any);
        invalidateHistoryCache();
        const activityRef = doc(collection(db, 'users', userId, 'activities'));
        const write = setDoc(activityRef, { ...built, createdAt: serverTimestamp() });
        const saved = normalizeActivityRecord(activityRef.id, built, userId) as Activity;

        const acknowledged = await Promise.race([
            write.then(() => true),
            new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WRITE_ACK_TIMEOUT_MS))
        ]);
        if (!acknowledged) {
            pendingWriteIds.add(activityRef.id);
            write
                .then(() => {
                    pendingWriteIds.delete(activityRef.id);
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('offline-sync-complete', { detail: { synced: 1, failed: 0 } }));
                    }
                })
                .catch((error) => {
                    pendingWriteIds.delete(activityRef.id);
                    console.error('Pending activity write was rejected:', error);
                });
        }
        return saved;
    },

    // Update time and details of an existing activity; details are normalized for `type`.
    updateActivity: async (
        userId: string,
        activityId: string,
        activity: { type: string; timestamp?: Date; details: Record<string, unknown> }
    ): Promise<boolean> => {
        try {
            if (activityId.startsWith('offline-')) return false;
            invalidateHistoryCache();
            const built = buildActivityDoc({
                babyId: userId,
                type: activity.type,
                timestamp: activity.timestamp || new Date(),
                details: activity.details
            });
            await updateDoc(doc(db, 'users', userId, 'activities', activityId), {
                ...(activity.timestamp ? { timestamp: built.timestamp } : {}),
                details: built.details,
                schemaVersion: built.schemaVersion,
                updatedAt: serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error updating activity:', error);
            return false;
        }
    },

    getPendingActivitiesCount: async (userId: string): Promise<number> => {
        return getQueuedActivities(userId).length + pendingWriteIds.size;
    },

    /**
     * Send activities left in the legacy localStorage queue. Each one is written
     * under its local id, so running this twice (two tabs, mount + online event)
     * cannot create duplicates.
     */
    syncPendingActivities: async (userId: string): Promise<{ synced: number; failed: number }> => {
        if (syncInFlight) return syncInFlight;
        syncInFlight = (async () => {
            const queue = getQueuedActivities(userId);
            if (queue.length === 0) return { synced: 0, failed: 0 };

            const syncedIds: string[] = [];
            const dropIds: string[] = [];
            for (const queuedItem of queue) {
                let built;
                try {
                    built = buildActivityDoc(queuedItem.activity as any);
                } catch (error) {
                    console.error('Dropping invalid queued activity:', queuedItem.localId, error);
                    dropIds.push(queuedItem.localId);
                    continue;
                }
                try {
                    await setDoc(doc(db, 'users', userId, 'activities', queuedItem.localId), {
                        ...built,
                        createdAt: serverTimestamp()
                    });
                    syncedIds.push(queuedItem.localId);
                } catch (error) {
                    console.error('Error syncing queued activity:', queuedItem.localId, error);
                }
            }

            removeQueuedActivities(userId, [...syncedIds, ...dropIds]);
            if (syncedIds.length > 0) invalidateHistoryCache();
            const failed = getQueuedActivities(userId).length;
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('offline-sync-complete', {
                    detail: { synced: syncedIds.length, failed }
                }));
            }
            return { synced: syncedIds.length, failed };
        })();
        try {
            return await syncInFlight;
        } finally {
            syncInFlight = null;
        }
    },

    // Delete an activity (users/{userId}/activities/{activityId}), including one still in the legacy queue.
    deleteActivity: async (userId: string, activityId: string): Promise<boolean> => {
        invalidateHistoryCache();
        try {
            if (activityId.startsWith('offline-')) {
                removeQueuedActivities(userId, [activityId]);
            }
            const deletion = deleteDoc(doc(db, 'users', userId, 'activities', activityId));
            const acknowledged = await Promise.race([
                deletion.then(() => true),
                new Promise<boolean>((resolve) => setTimeout(() => resolve(false), WRITE_ACK_TIMEOUT_MS))
            ]);
            if (!acknowledged) {
                deletion.catch((error) => console.error('Pending activity delete was rejected:', error));
            }
            return true;
        } catch (error) {
            console.error('Error deleting activity:', error);
            return false;
        }
    },
    
    // Helper method to get current user and call getBabyByUserId
    getCurrentUserBaby: async (): Promise<Baby | null> => {
        const user = getCurrentUser();
        if (!user) return null;
        return firestore.getBabyByUserId(user.uid);
    },
    
    // Helper method to get current user activities
    getCurrentUserActivities: async (): Promise<Activity[]> => {
        const user = getCurrentUser();
        if (!user) return [];
        return firestore.getActivities(user.uid);
    },

    // Sleep timer functions
    // Get ongoing sleep session for a baby
    getOngoingSleep: async (userId: string, babyId: string): Promise<{ startTime: Date } | null> => {
        try {
            const sleepDocRef = doc(db, 'users', userId, 'ongoingSleep', babyId);
            const sleepDoc = await getDoc(sleepDocRef);
            
            if (sleepDoc.exists()) {
                const data = sleepDoc.data();
                return {
                    startTime: data.startTime.toDate()
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error getting ongoing sleep:', error);
            return null;
        }
    },

    // Start a new sleep session
    startOngoingSleep: async (userId: string, babyId: string, startTime: Date): Promise<boolean> => {
        try {
            const sleepDocRef = doc(db, 'users', userId, 'ongoingSleep', babyId);
            await setDoc(sleepDocRef, {
                startTime: startTime,
                createdAt: serverTimestamp()
            });
            
            console.log('✅ Sleep timer started:', startTime);
            return true;
        } catch (error) {
            console.error('Error starting sleep timer:', error);
            return false;
        }
    },

    // Remove the ongoing sleep session marker
    clearOngoingSleep: async (userId: string, babyId: string): Promise<boolean> => {
        try {
            await deleteDoc(doc(db, 'users', userId, 'ongoingSleep', babyId));
            return true;
        } catch (error) {
            console.error('Error clearing sleep timer:', error);
            return false;
        }
    },

    // --- Solid Food Menu Management ---

    // Get list of saved food items
    getFoodItems: async (userId: string): Promise<string[]> => {
        try {
            // Store in babies collection to reuse existing permissions
            const docRef = doc(db, 'babies', userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const items = docSnap.data().foodMenu || [];
                const mergedItems = Array.isArray(items) ? mergeFoodItems(items) : [];
                if (JSON.stringify(items) !== JSON.stringify(mergedItems)) {
                    await setDoc(docRef, { foodMenu: mergedItems, updatedAt: serverTimestamp() }, { merge: true });
                }
                return [...mergedItems].reverse();
            }
            return [];
        } catch (error) {
            console.error('Error getting food items:', error);
            return [];
        }
    },

    // Add a new food item
    addFoodItem: async (userId: string, foodName: string): Promise<boolean> => {
        try {
            const docRef = doc(db, 'babies', userId);
            const docSnap = await getDoc(docRef);
            
            let currentItems: unknown[] = [];
            if (docSnap.exists()) {
                currentItems = docSnap.data().foodMenu || [];
            }

            // Adding or re-using an item makes it the most recent one.
            const mergedItems = moveFoodItemToEnd(mergeFoodItems(currentItems), normalizeFoodName(foodName));
            await setDoc(docRef, {
                foodMenu: mergedItems,
                updatedAt: serverTimestamp()
            }, { merge: true });
            return true;
        } catch (error) {
            console.error('Error adding food item:', error);
            return false;
        }
    },

    // Delete a food item
    deleteFoodItem: async (userId: string, foodName: string): Promise<boolean> => {
        try {
            const docRef = doc(db, 'babies', userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const currentItems = docSnap.data().foodMenu || [];
                const newItems = currentItems.filter((item: string) => item !== foodName);
                
                await setDoc(docRef, {
                    foodMenu: newItems,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
            return true;
        } catch (error) {
            console.error('Error deleting food item:', error);
            return false;
        }
    },

    // Rename a food item
    renameFoodItem: async (userId: string, oldName: string, newName: string): Promise<boolean> => {
        try {
            const docRef = doc(db, 'babies', userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                const currentItems = docSnap.data().foodMenu || [];
                // Remove old, add new, keep unique
                const newItems = currentItems.filter((item: string) => item !== oldName);
                if (!newItems.includes(newName)) {
                    newItems.push(newName);
                }
                
                await setDoc(docRef, {
                    foodMenu: newItems,
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
            return true;
        } catch (error) {
            console.error('Error renaming food item:', error);
            return false;
        }
    }
};
