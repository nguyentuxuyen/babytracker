import { 
    doc, 
    getDoc, 
    setDoc, 
    collection, 
    addDoc, 
    getDocs, 
    deleteDoc, 
    query, 
    orderBy,
    serverTimestamp,
    limit,
    where,
    Timestamp
} from 'firebase/firestore';
import { db } from './config';
import { Baby, Activity } from '../types';
import { getCurrentUser } from './auth';

type QueuedActivity = {
    localId: string;
    userId: string;
    activity: Omit<Activity, 'id'>;
    queuedAt: string;
    attempts: number;
    lastError?: string;
};

const getQueueStorageKey = (userId: string) => `offline-activity-queue:${userId}`;

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
        const parsed = JSON.parse(raw) as QueuedActivity[];
        return parsed.map((item) => ({
            ...item,
            activity: {
                ...item.activity,
                timestamp: new Date(item.activity.timestamp)
            } as Omit<Activity, 'id'>
        }));
    } catch (error) {
        console.error('Error reading offline queue:', error);
        return [];
    }
};

const saveQueuedActivities = (userId: string, queue: QueuedActivity[]) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(getQueueStorageKey(userId), JSON.stringify(queue));
        emitQueueUpdated();
    } catch (error) {
        console.error('Error saving offline queue:', error);
    }
};

const enqueueActivity = (userId: string, activity: Omit<Activity, 'id'>): QueuedActivity => {
    const queue = getQueuedActivities(userId);
    const queued: QueuedActivity = {
        localId: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        activity,
        queuedAt: new Date().toISOString(),
        attempts: 0
    };
    queue.unshift(queued);
    saveQueuedActivities(userId, queue);
    return queued;
};

const shouldQueueActivity = (error: unknown): boolean => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
    if (!error || typeof error !== 'object') return false;
    const code = 'code' in error ? String((error as { code?: string }).code || '') : '';
    return ['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(code);
};

export const firestore = {
    // Get baby data by user email (compatible with existing Firebase data structure)
    getBabyByEmail: async (email: string): Promise<Baby | null> => {
        try {
            console.log('🔍 Searching for baby data with email:', email);
            
            // Query the babies collection to find document where mail field equals user email
            const babiesRef = collection(db, 'babies');
            const q = query(babiesRef);
            const querySnapshot = await getDocs(q);
            
            console.log('📊 Total documents in babies collection:', querySnapshot.size);
            
            let babyData: Baby | null = null;
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                console.log('📄 Document ID:', doc.id, 'Data:', data);
                console.log('📧 Comparing emails:', data.mail, '===', email, '?', data.mail === email);
                
                if (data.mail === email) {
                    console.log('✅ Found matching baby data!');
                    babyData = {
                        id: doc.id,
                        name: data.name || '',
                        birthDate: data.birthDate ? data.birthDate.toDate() : new Date(),
                        dueDate: data.dueDate ? data.dueDate.toDate() : undefined,
                        gender: data.gender || 'male',
                        birthWeight: data.birthWeight || 0,
                        birthHeight: data.birthHeight || 0,
                        avatarUrl: data.avatarUrl || ''
                    };
                }
            });
            
            if (!babyData) {
                console.log('❌ No baby data found for email:', email);
            }
            
            return babyData;
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
                createdAt: serverTimestamp()
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
            await setDoc(docRef, {
                name: babyData.name,
                birthDate: babyData.birthDate,
                dueDate: babyData.dueDate || null,
                gender: babyData.gender,
                birthWeight: babyData.birthWeight,
                birthHeight: babyData.birthHeight,
                avatarUrl: babyData.avatarUrl || '',
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
            }, { merge: true });
            
            return true;
        } catch (error) {
            console.error('Error saving baby data:', error);
            return false;
        }
    },
    
    // Get activities for user (following security rules: /users/{userId}/activities)
    // Load full history (10 years) to ensure all measurements are available for growth charts
    getActivities: async (userId: string, daysToLoad: number = 3650, options?: { forceNetwork?: boolean }): Promise<Activity[]> => {
        try {
            const activitiesRef = collection(db, 'users', userId, 'activities');
            
            // Calculate date N days ago
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToLoad);
            
            const q = query(
                activitiesRef, 
                where('timestamp', '>=', Timestamp.fromDate(cutoffDate)),
                orderBy('timestamp', 'desc'),
                limit(3000) // Load all historical data for growth charts and analytics
            );
            
            // Force network by adding cache busting timestamp
            // This helps iOS PWA get fresh data when resuming from background
            const querySnapshot = await getDocs(q);
            
            const activities: Activity[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                activities.push({
                    id: doc.id,
                    babyId: data.babyId,
                    type: data.type,
                    timestamp: data.timestamp.toDate(), // Convert Firestore Timestamp to Date
                    details: data.details
                });
            });

            const queuedActivities: Activity[] = getQueuedActivities(userId).map((queued) => ({
                id: queued.localId,
                ...queued.activity
            } as Activity));

            const mergedActivities = [...activities, ...queuedActivities]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            
            return mergedActivities;
        } catch (error) {
            console.error('Error getting activities:', error);
            const queuedActivities: Activity[] = getQueuedActivities(userId).map((queued) => ({
                id: queued.localId,
                ...queued.activity
            } as Activity));
            return queuedActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        }
    },
    
    // Save activity under user subcollection (following security rules: /users/{userId}/activities)
    saveActivity: async (userId: string, activity: Omit<Activity, 'id'>): Promise<Activity> => {
        try {
            const activitiesRef = collection(db, 'users', userId, 'activities');
            const docRef = await addDoc(activitiesRef, {
                babyId: activity.babyId,
                type: activity.type,
                timestamp: activity.timestamp,
                details: activity.details,
                createdAt: serverTimestamp()
            });
            
            return {
                id: docRef.id,
                ...activity
            } as Activity;
        } catch (error) {
            if (shouldQueueActivity(error)) {
                const queued = enqueueActivity(userId, activity);
                console.warn('Saved activity to offline queue:', queued.localId);
                return {
                    id: queued.localId,
                    ...activity
                } as Activity;
            }

            console.error('Error saving activity:', error);
            throw error;
        }
    },

    getPendingActivitiesCount: async (userId: string): Promise<number> => {
        return getQueuedActivities(userId).length;
    },

    syncPendingActivities: async (userId: string): Promise<{ synced: number; failed: number }> => {
        const queue = getQueuedActivities(userId);
        if (queue.length === 0) {
            return { synced: 0, failed: 0 };
        }

        const activitiesRef = collection(db, 'users', userId, 'activities');
        const remainingQueue: QueuedActivity[] = [];
        let synced = 0;

        for (const queuedItem of queue) {
            try {
                await addDoc(activitiesRef, {
                    babyId: queuedItem.activity.babyId,
                    type: queuedItem.activity.type,
                    timestamp: queuedItem.activity.timestamp,
                    details: queuedItem.activity.details,
                    createdAt: serverTimestamp()
                });
                synced += 1;
            } catch (error) {
                const nextAttempts = queuedItem.attempts + 1;
                remainingQueue.push({
                    ...queuedItem,
                    attempts: nextAttempts,
                    lastError: error instanceof Error ? error.message : 'Unknown sync error'
                });
            }
        }

        saveQueuedActivities(userId, remainingQueue);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('offline-sync-complete', {
                detail: { synced, failed: remainingQueue.length }
            }));
        }

        return { synced, failed: remainingQueue.length };
    },
    
    // Delete activity from user subcollection (following security rules: /users/{userId}/activities/{activityId})
    deleteActivity: async (userId: string, activityId: string): Promise<boolean> => {
        try {
            const activityRef = doc(db, 'users', userId, 'activities', activityId);
            await deleteDoc(activityRef);
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

    // Stop ongoing sleep session and return the sleep data
    stopOngoingSleep: async (userId: string, babyId: string): Promise<{ startTime: Date; endTime: Date; duration: number } | null> => {
        try {
            const sleepDocRef = doc(db, 'users', userId, 'ongoingSleep', babyId);
            const sleepDoc = await getDoc(sleepDocRef);
            
            if (!sleepDoc.exists()) {
                console.log('No ongoing sleep session found');
                return null;
            }
            
            const data = sleepDoc.data();
            const startTime = data.startTime.toDate();
            const endTime = new Date();
            const durationMs = endTime.getTime() - startTime.getTime();
            const durationMinutes = Math.round(durationMs / (1000 * 60));
            
            // Delete the ongoing sleep document
            await deleteDoc(sleepDocRef);
            
            console.log('✅ Sleep timer stopped. Duration:', durationMinutes, 'minutes');
            
            return {
                startTime,
                endTime,
                duration: durationMinutes
            };
        } catch (error) {
            console.error('Error stopping sleep timer:', error);
            return null;
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
                return Array.isArray(items) ? [...items].reverse() : [];
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
            
            let currentItems: string[] = [];
            if (docSnap.exists()) {
                currentItems = docSnap.data().foodMenu || [];
            }

            // Avoid duplicates
            if (!currentItems.includes(foodName)) {
                await setDoc(docRef, {
                    foodMenu: [...currentItems, foodName],
                    updatedAt: serverTimestamp()
                }, { merge: true });
            }
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
