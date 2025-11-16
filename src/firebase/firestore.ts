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
    // Optimized: Only load last 90 days by default for better performance
    getActivities: async (userId: string, daysToLoad: number = 90): Promise<Activity[]> => {
        try {
            const activitiesRef = collection(db, 'users', userId, 'activities');
            
            // Calculate date 90 days ago
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToLoad);
            
            const q = query(
                activitiesRef, 
                where('timestamp', '>=', Timestamp.fromDate(cutoffDate)),
                orderBy('timestamp', 'desc'),
                limit(500) // Hard limit to prevent excessive data loading
            );
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
            
            return activities;
        } catch (error) {
            // Silently fail in production
            return [];
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
            console.error('Error saving activity:', error);
            throw error;
        }
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

    // Daily Rating functions
    // Get daily rating for a specific date
    getDailyRating: async (userId: string, babyId: string, date: Date): Promise<{ rating: number; notes?: string } | null> => {
        try {
            // Normalize date to start of day
            const dateKey = new Date(date);
            dateKey.setHours(0, 0, 0, 0);
            const dateStr = dateKey.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            const ratingDocRef = doc(db, 'users', userId, 'dailyRatings', dateStr);
            const ratingDoc = await getDoc(ratingDocRef);
            
            if (ratingDoc.exists()) {
                const data = ratingDoc.data();
                return {
                    rating: data.rating,
                    notes: data.notes
                };
            }
            
            return null;
        } catch (error) {
            console.error('Error getting daily rating:', error);
            return null;
        }
    },

    // Save or update daily rating for a specific date
    saveDailyRating: async (userId: string, babyId: string, date: Date, rating: number, notes?: string): Promise<boolean> => {
        try {
            // Normalize date to start of day
            const dateKey = new Date(date);
            dateKey.setHours(0, 0, 0, 0);
            const dateStr = dateKey.toISOString().split('T')[0]; // YYYY-MM-DD format
            
            const ratingDocRef = doc(db, 'users', userId, 'dailyRatings', dateStr);
            await setDoc(ratingDocRef, {
                babyId: babyId,
                rating: rating,
                notes: notes || '',
                date: dateKey,
                updatedAt: serverTimestamp()
            }, { merge: true });
            
            console.log('✅ Daily rating saved:', rating, 'stars for', dateStr);
            return true;
        } catch (error) {
            console.error('Error saving daily rating:', error);
            return false;
        }
    },

    // Get all daily ratings for a date range (for calendar view)
    getDailyRatingsForRange: async (userId: string, startDate: Date, endDate: Date): Promise<Map<string, number>> => {
        try {
            const ratingsRef = collection(db, 'users', userId, 'dailyRatings');
            const querySnapshot = await getDocs(ratingsRef);
            
            const ratingsMap = new Map<string, number>();
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                const dateStr = doc.id; // Document ID is the date string (YYYY-MM-DD)
                const docDate = new Date(dateStr);
                
                // Only include ratings within the date range
                if (docDate >= startDate && docDate <= endDate) {
                    ratingsMap.set(dateStr, data.rating);
                }
            });
            
            return ratingsMap;
        } catch (error) {
            console.error('Error getting daily ratings for range:', error);
            return new Map();
        }
    }
};