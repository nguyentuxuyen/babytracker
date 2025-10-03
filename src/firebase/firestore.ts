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
    serverTimestamp
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
    getActivities: async (userId: string): Promise<Activity[]> => {
        try {
            const activitiesRef = collection(db, 'users', userId, 'activities');
            const q = query(activitiesRef, orderBy('timestamp', 'desc'));
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
            console.error('Error getting activities:', error);
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
    }
};