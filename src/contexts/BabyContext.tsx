import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Baby, Activity } from '../types';
import { firestore } from '../firebase/firestore';
import { useAuth } from './AuthContext';

interface BabyContextType {
    baby: Baby | null;
    activities: Activity[];
    loading: boolean;
    setBaby: (baby: Baby) => void;
    saveBabyData: (baby: Baby) => Promise<boolean>;
    fetchBabyData: () => Promise<void>;
    addActivity: (activity: Omit<Activity, 'id'>) => Promise<Activity | null>;
    deleteActivity: (activityId: string) => Promise<boolean>;
    refreshActivities: () => Promise<void>;
}

const BabyContext = createContext<BabyContextType | undefined>(undefined);

interface BabyProviderProps {
    children: ReactNode;
}

export const BabyProvider: React.FC<BabyProviderProps> = ({ children }) => {
    const [baby, setBaby] = useState<Baby | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(false);
    const { currentUser } = useAuth();

    // Fetch baby data when user changes
    useEffect(() => {
        const loadBabyData = async () => {
            if (currentUser?.email) {
                try {
                    console.log('🚀 Loading baby data for user:', currentUser.email, 'UID:', currentUser.uid);
                    setLoading(true);
                    
                    // First, try to get baby data by UID (new standard format)
                    let babyData = await firestore.getBabyByUserId(currentUser.uid);
                    console.log('📝 Baby data from UID search:', babyData);
                    
                    if (babyData) {
                        console.log('✅ Found baby data by UID, setting data...');
                        setBaby(babyData);
                        const activitiesData = await firestore.getActivities(currentUser.uid);
                        setActivities(activitiesData);
                    } else {
                        console.log('❌ No baby data found by UID, checking for legacy data by email...');
                        
                        // Try to get legacy baby data by email
                        const legacyBabyData = await firestore.getBabyByEmail(currentUser.email);
                        console.log('📝 Legacy baby data from email search:', legacyBabyData);
                        
                        if (legacyBabyData) {
                            console.log('📦 Found legacy baby data, attempting migration...');
                            
                            // Try to migrate the data to user's UID
                            const migrationSuccess = await firestore.migrateBabyDataToUID(currentUser.email, currentUser.uid);
                            
                            if (migrationSuccess) {
                                console.log('✅ Migration successful, loading migrated data...');
                                // Re-fetch by UID to get the migrated data
                                babyData = await firestore.getBabyByUserId(currentUser.uid);
                                if (babyData) {
                                    setBaby(babyData);
                                } else {
                                    console.log('⚠️ Migration complete but data not found, using legacy data');
                                    setBaby(legacyBabyData);
                                }
                            } else {
                                console.log('⚠️ Migration failed, using legacy data');
                                setBaby(legacyBabyData);
                            }
                            
                            const activitiesData = await firestore.getActivities(currentUser.uid);
                            setActivities(activitiesData);
                        } else {
                            console.log('❌ No baby data found at all (neither UID nor email)');
                        }
                    }
                } catch (error) {
                    console.error('❌ Error loading baby data:', error);
                } finally {
                    setLoading(false);
                }
            } else {
                console.log('👤 No current user, clearing data');
                setBaby(null);
                setActivities([]);
            }
        };
        
        loadBabyData();
    }, [currentUser]);

    const fetchBabyData = async () => {
        if (!currentUser?.email) return;
        
        try {
            setLoading(true);
            // Try to get baby data by email first (compatible with existing data)
            let babyData = await firestore.getBabyByEmail(currentUser.email);
            
            // If not found by email, try by UID
            if (!babyData) {
                babyData = await firestore.getBabyByUserId(currentUser.uid);
            }
            
            if (babyData) {
                setBaby(babyData);
                await refreshActivities();
            }
        } catch (error) {
            console.error('Error fetching baby data:', error);
        } finally {
            setLoading(false);
        }
    };

    const saveBabyData = async (babyData: Baby): Promise<boolean> => {
        if (!currentUser?.email || !currentUser?.uid) return false;
        
        try {
            setLoading(true);
            // Use the saveBabyDataWithEmail function with userUid parameter
            const success = await firestore.saveBabyDataWithEmail(currentUser.email, babyData, currentUser.uid);
            if (success) {
                setBaby(babyData);
            }
            return success;
        } catch (error) {
            console.error('Error saving baby data:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const refreshActivities = async () => {
        if (!currentUser?.uid) return;
        
        try {
            const activitiesData = await firestore.getActivities(currentUser.uid);
            setActivities(activitiesData);
        } catch (error) {
            console.error('Error fetching activities:', error);
        }
    };

    const addActivity = async (activityData: Omit<Activity, 'id'>): Promise<Activity | null> => {
        if (!currentUser?.uid) return null;
        
        try {
            const newActivity = await firestore.saveActivity(currentUser.uid, {
                ...activityData,
                babyId: currentUser.uid
            });
            
            // Update local state
            setActivities(prev => [newActivity, ...prev]);
            return newActivity;
        } catch (error) {
            console.error('Error adding activity:', error);
            return null;
        }
    };

    const deleteActivity = async (activityId: string): Promise<boolean> => {
        if (!currentUser?.uid) return false;
        
        try {
            const success = await firestore.deleteActivity(currentUser.uid, activityId);
            if (success) {
                setActivities(prev => prev.filter(activity => activity.id !== activityId));
            }
            return success;
        } catch (error) {
            console.error('Error deleting activity:', error);
            return false;
        }
    };

    return (
        <BabyContext.Provider value={{ 
            baby, 
            activities,
            loading,
            setBaby, 
            saveBabyData,
            fetchBabyData,
            addActivity,
            deleteActivity,
            refreshActivities
        }}>
            {children}
        </BabyContext.Provider>
    );
};

export const useBaby = () => {
    const context = useContext(BabyContext);
    if (context === undefined) {
        throw new Error('useBaby must be used within a BabyProvider');
    }
    return context;
};