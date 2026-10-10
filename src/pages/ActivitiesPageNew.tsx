import React, { useState, useEffect, useMemo, useRef, Component, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { useHistory, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button as MuiButton, TextField, MenuItem, Select, InputLabel, FormControl, IconButton, Grid, Snackbar, Alert, InputAdornment, Autocomplete, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { AssistantComposer } from '../components/common/AssistantComposer';
import RecentDaysStrip from '../components/common/RecentDaysStrip';
import { BabyIcon, BathIcon, CloseIcon, FoodIcon, MeasurementIcon, MemoIcon, MilkIcon, SleepIcon, TimerIcon } from '../components/common/icons';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { filterFoodItems } from '../utils/foodSearch';
import i18n from '../i18n';
import { formatHoursMinutes } from '../i18n/format';
import DayStatsCard from '../components/common/DayStatsCard';
import { suggestMilkAmounts } from '../utils/milkPresets';
import RecentActivityList from '../components/common/RecentActivityList';
import { ACTIVITY_COLORS, getActivityIcon } from '../components/common/activityDisplay';
import { ChoiceChips, SectionLabel, SegmentedControl, fieldSx, nativeTimeInputStyle } from '../components/common/FormControls';
import { calculateStatsForDate } from '../utils/dailyStats';

const isSameLocalDay = (left: Date, right: Date) => (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
);

const RECENT_FOOD_CHIP_COUNT = 8;

const normalizeFoodName = (value: string) => value.trim();

const resolveFeedingFoodType = (details?: Record<string, any>, fallback: 'milk' | 'solid' = 'milk'): 'milk' | 'solid' => {
    if (!details) return fallback;
    if (details.foodType === 'solid') return 'solid';
    if (details.foodType === 'milk') return 'milk';
    if (details.foodItem || details.foodPreference || details.isAllergic) return 'solid';
    return fallback;
};

const mergeFoodItems = (items: string[]) => {
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

interface Activity {
    id: string;
    type: 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo' | 'bath';
    timestamp: Date;
    details: any;
}

// Error Boundary Component
interface ErrorBoundaryState {
    hasError: boolean;
    errorMessage: string;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false, errorMessage: '' };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        console.error('ErrorBoundary caught error:', error);
        return { hasError: true, errorMessage: error.message };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('ErrorBoundary details:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography variant="h6" color="error">{i18n.t('common.errorOccurred')}</Typography>
                    <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>{i18n.t('common.errorDetail', { message: this.state.errorMessage })}</Typography>
                    <MuiButton onClick={() => this.setState({ hasError: false, errorMessage: '' })} variant="contained">
                        {i18n.t('common.retry')}
                    </MuiButton>
                </Box>
            );
        }
        return this.props.children;
    }
}

const ActivitiesPage: React.FC = () => {
    const history = useHistory();
    const location = useLocation();
    const { baby, activities: contextActivities, refreshActivities } = useBaby();
    const { selectedDate, setSelectedDate } = useDateContext();
    const [activities, setActivities] = useState<Activity[]>();
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [showAiComposer, setShowAiComposer] = useState(false);
    const { user: currentUser } = useAuth();
    const { t } = useTranslation();
    
    const { ongoingSleep, elapsedSeconds: sleepElapsedTime, setOngoingSleep } = useSleepTimer(currentUser?.uid, baby?.id);

    // Real-time update state for time since last activity
    const [currentTime, setCurrentTime] = useState(new Date());

    // Food items state
    const [foodItems, setFoodItems] = useState<string[]>([]);
    const [foodMenuOpen, setFoodMenuOpen] = useState(false);
    const [showHomeDatePicker, setShowHomeDatePicker] = useState(false);
    const hasLoadedInitialDate = useRef(false);
    const selectedDateTime = selectedDate.getTime();

    useEffect(() => {
        if (new URLSearchParams(location.search).get('add') !== '1') return;
        setEditingActivity(null);
        setHideActivityType(false);
        setShowAiComposer(true);
        history.replace({ pathname: '/', search: '' });
    }, [history, location.search]);

    const normalizedActivities = useMemo(() => contextActivities.map((activity: any) => {
        let normalizedType = activity.type;
        const lowerType = String(activity.type).toLowerCase();
        if (['diaperchange', 'thay tã', 'tã', 'đi tè', 'đi ị', 'diaper'].includes(lowerType)) {
            normalizedType = 'diaper';
        } else if (['sữa', 'bú sữa', 'feeding'].includes(lowerType)) {
            normalizedType = 'feeding';
        } else if (['ngủ', 'sleep'].includes(lowerType)) {
            normalizedType = 'sleep';
        } else if (['đo lường', 'số đo', 'measurement'].includes(lowerType)) {
            normalizedType = 'measurement';
        } else if (['ghi chú', 'memo'].includes(lowerType)) {
            normalizedType = 'memo';
        }

        const normalizedDetails = activity.details ? { ...activity.details } : {};
        if (normalizedType === 'feeding' && !normalizedDetails.amount && typeof activity.details?.time === 'number') {
            normalizedDetails.amount = activity.details.time;
        }

        if (normalizedType === 'feeding') {
            normalizedDetails.foodType = resolveFeedingFoodType(normalizedDetails, normalizedDetails.foodType || 'milk');
        }

        return {
            id: activity.id,
            type: normalizedType,
            timestamp: activity.timestamp,
            details: normalizedDetails
        } as Activity;
    }), [contextActivities]);

    useEffect(() => {
        setActivities(normalizedActivities);
    }, [normalizedActivities]);

    const milkAmountSuggestions = useMemo(() => suggestMilkAmounts(activities || []), [activities]);

    useEffect(() => {
        if (!hasLoadedInitialDate.current) {
            hasLoadedInitialDate.current = true;
            return;
        }
        if (currentUser?.uid) {
            void refreshActivities(selectedDate);
        }
        // refreshActivities is intentionally excluded because its context identity changes on render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.uid, selectedDateTime]);

    // Update current time every 5 minutes for real-time display
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 300000); // Update every 5 minutes
        
        return () => clearInterval(interval);
    }, []);

    // Load food items
    useEffect(() => {
        const loadFoodItems = async () => {
            if (currentUser?.uid) {
                try {
                    const items = await firestore.getFoodItems(currentUser.uid);
                    setFoodItems(mergeFoodItems(items));
                } catch (error) {
                    console.error('Error loading food items:', error);
                }
            }
        };
        loadFoodItems();
    }, [currentUser]);    

    const [formData, setFormData] = useState<{
        type: 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo' | 'bath';
        time: string;
        amount: string;
        duration: string;
        notes: string;
        weight: string;
        height: string;
        temperature: string;
        isUrine?: boolean;
        isStool?: boolean;
        stoolColor?: Array<'vàng' | 'nâu' | 'xám'>;
        stoolConsistency?: 'lỏng' | 'bình thường' | 'khô';
        timestamp?: string;
        foodType?: 'milk' | 'solid';
        foodItem?: string;
        isAllergic?: boolean;
        foodPreference?: 'enthusiastic' | 'normal' | 'dislike' | 'allergic';
    }>({
        type: 'feeding',
        time: new Date().toTimeString().slice(0, 5), // HH:MM format
        amount: '',
        duration: '',
        notes: '',
        weight: '',
        height: '',
        temperature: '',
        isUrine: true,
        isStool: false,
        stoolColor: [],
        stoolConsistency: 'bình thường',
        timestamp: undefined,
        foodType: 'milk',
        foodItem: '',
        isAllergic: false,
        foodPreference: 'normal'
    });

    // States for edit and delete functionality
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [hideActivityType, setHideActivityType] = useState(false);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success'
    });

    // Bulk registration states
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [bulkTimes, setBulkTimes] = useState<string[]>([new Date().toTimeString().slice(0, 5)]);
    const [bulkProgress, setBulkProgress] = useState<{ total: number; completed: number; errors: string[] }>({
        total: 0,
        completed: 0,
        errors: []
    });

    // Refresh activities through BabyContext to avoid a duplicate initial request.
    useEffect(() => {
        const loadActivities = async () => {
            if (currentUser?.uid) {
                try {
                    setLoading(true);
                    await refreshActivities();
                } catch (error) {
                    // Error loading activities - silently fail in production
                } finally {
                    setLoading(false);
                }
            }
        };

        // Thêm listener cho iOS/PWA: Khi mở lại app từ background, tự động tải lại dữ liệu mới nhất
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // iOS PWA freezes rendering briefly, so delay reload slightly to avoid race conditions
                const reloadDelay = navigator.userAgent.includes('iPad') || navigator.userAgent.includes('iPhone') ? 500 : 0;
                setTimeout(() => {
                    if (currentUser?.uid) {
                        void refreshActivities(selectedDate);
                    }
                    setCurrentTime(new Date()); // Cập nhật lại đồng hồ ngay lập tức
                }, reloadDelay);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        const handleOfflineSyncComplete = (event: Event) => {
            const syncEvent = event as CustomEvent<{ synced: number; failed: number }>;
            const syncedCount = syncEvent.detail?.synced || 0;
            if (syncedCount > 0) {
                loadActivities();
                setSnackbar({
                    open: true,
                    message: t('activities.snackbar.offlineSynced', { count: syncedCount }),
                    severity: 'success'
                });
            }
        };
        window.addEventListener('offline-sync-complete', handleOfflineSyncComplete as EventListener);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('offline-sync-complete', handleOfflineSyncComplete as EventListener);
        };
        // Initial activities are loaded by BabyContext; refresh only on visibility changes here.
        // refreshActivities is intentionally excluded because its context identity changes on render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser]);    

    // Guards the sleep card against double taps while a start/stop is in flight.
    // Released after a few seconds at the latest so a stalled (offline) write cannot lock the card.
    const sleepActionBusy = useRef(false);
    const lockSleepAction = () => {
        if (sleepActionBusy.current) return null;
        sleepActionBusy.current = true;
        const release = () => { sleepActionBusy.current = false; };
        const timeout = window.setTimeout(release, 3000);
        return () => {
            window.clearTimeout(timeout);
            release();
        };
    };

    // Handle start sleep
    const handleStartSleep = async () => {
        if (!currentUser?.uid || !baby?.id) {
            setSnackbar({
                open: true,
                message: t('activities.snackbar.loginAndSetupBaby'),
                severity: 'warning'
            });
            return;
        }

        const unlock = lockSleepAction();
        if (!unlock) return;

        // Show the timer immediately; roll back if the write fails.
        const started = { startTime: new Date() };
        setOngoingSleep(started);
        try {
            const success = await firestore.startOngoingSleep(currentUser.uid, baby.id, started.startTime);

            if (success) {
                setSnackbar({
                    open: true,
                    message: t('activities.snackbar.sleepTimerStarted'),
                    severity: 'success'
                });
            } else {
                setOngoingSleep(prev => (prev === started ? null : prev));
                setSnackbar({
                    open: true,
                    message: t('activities.snackbar.sleepTimerStartFailed'),
                    severity: 'error'
                });
            }
        } finally {
            unlock();
        }
    };

    // Handle stop sleep
    const handleStopSleep = async () => {
        if (!currentUser?.uid || !baby?.id || !ongoingSleep) return;

        const unlock = lockSleepAction();
        if (!unlock) return;

        const userId = currentUser.uid;
        const babyId = baby.id;
        const stopped = ongoingSleep;
        const endTime = new Date();
        const duration = Math.round((endTime.getTime() - stopped.startTime.getTime()) / (1000 * 60));

        const activityData = {
            babyId,
            type: 'sleep' as const,
            timestamp: endTime,
            details: {
                time: endTime,
                duration,
                notes: `開始: ${stopped.startTime.toLocaleTimeString('ja-JP')}`
            }
        };

        // Hide the timer immediately; restore it if saving the sleep fails.
        setOngoingSleep(null);
        try {
            const [savedActivity, cleared] = await Promise.all([
                firestore.saveActivity(userId, activityData).catch((error) => {
                    console.error('Error stopping sleep:', error);
                    return null;
                }),
                firestore.clearOngoingSleep(userId, babyId)
            ]);

            if (!savedActivity) {
                // Put the session back so the sleep is not lost.
                if (cleared) void firestore.startOngoingSleep(userId, babyId, stopped.startTime);
                setOngoingSleep(prev => prev ?? stopped);
                setSnackbar({
                    open: true,
                    message: t('activities.snackbar.sleepTimerStopFailed'),
                    severity: 'error'
                });
                return;
            }

            if (!cleared) void firestore.clearOngoingSleep(userId, babyId);

            const localActivity = {
                id: savedActivity.id,
                type: 'sleep' as const,
                timestamp: savedActivity.timestamp,
                details: savedActivity.details
            };
            setActivities(prev => [localActivity, ...(prev || [])]);
            setSnackbar({
                open: true,
                message: firestore.isPendingWrite(savedActivity.id)
                    ? t('activities.snackbar.sleepSavedOffline', { count: duration })
                    : t('activities.snackbar.sleepSaved', { count: duration }),
                severity: firestore.isPendingWrite(savedActivity.id) ? 'info' : 'success'
            });
        } finally {
            unlock();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!currentUser?.uid || !baby?.id) {
            setSnackbar({
                open: true,
                message: t('activities.snackbar.loginBeforeAdd'),
                severity: 'warning'
            });
            return;
        }
        
        try {
            setLoading(true);
            // The selected tab decides milk vs solid; solid-only fields may be unset or stale on the milk tab.
            const isSolid = formData.foodType === 'solid';
            const effectiveFoodType = isSolid ? 'solid' : 'milk';
            
            // Create timestamp using selected date and form time
            // If formData.timestamp exists (from sleep end time edit), use that as base date
            let timestamp: Date;
            if (formData.timestamp) {
                timestamp = new Date(formData.timestamp);
            } else {
                timestamp = new Date(selectedDate);
            }
            
            // Always update time from form data, UNLESS it's a sleep activity where we handle timestamp manually via End Time field
            if (formData.time && formData.type !== 'sleep') {
                const [hours, minutes] = formData.time.split(':').map(Number);
                timestamp.setHours(hours, minutes, 0, 0);
            } else if (formData.type === 'sleep' && !formData.timestamp) {
                // For new sleep activities where user didn't touch End Time (so formData.timestamp is undefined)
                // We use formData.time (which defaults to now)
                if (formData.time) {
                    const [hours, minutes] = formData.time.split(':').map(Number);
                    timestamp.setHours(hours, minutes, 0, 0);
                }
            }
            
            // Create activity details based on type
            let details: any = {};
            switch (formData.type) {
                case 'feeding':
                    details = {
                        time: timestamp,
                        amount: formData.amount ? Number(formData.amount) : 0,
                        notes: formData.notes || '',
                        foodType: effectiveFoodType,
                        foodItem: isSolid ? formData.foodItem || '' : '',
                        isAllergic: isSolid && !!formData.isAllergic,
                        foodPreference: isSolid ? formData.foodPreference || 'normal' : 'normal'
                    };

                    // Auto-save new food item to menu
                    const normalizedFoodItem = normalizeFoodName(formData.foodItem || '');
                    if (formData.foodType === 'solid' && normalizedFoodItem) {
                        // Don't await this to keep UI responsive
                        firestore.addFoodItem(currentUser.uid, normalizedFoodItem).then(success => {
                            if (success) {
                                // foodItems is most-recent first.
                                setFoodItems(prev => mergeFoodItems([normalizedFoodItem, ...prev]));
                            }
                        });
                    }
                    break;
                case 'sleep':
                    details = {
                        time: timestamp,
                        duration: formData.duration ? Number(formData.duration) : 0,
                        notes: formData.notes || ''
                    };
                    break;
                case 'diaper':
                    details = {
                        time: timestamp,
                        isUrine: !!formData.isUrine,
                        isStool: !!formData.isStool,
                        stoolColor: Array.isArray(formData.stoolColor) ? formData.stoolColor : (formData.stoolColor ? [formData.stoolColor] : []),
                        stoolConsistency: formData.stoolConsistency || 'bình thường',
                        notes: formData.notes || ''
                    };
                    break;
                case 'measurement':
                    details = {
                        height: formData.height ? Number(formData.height) : null,
                        weight: formData.weight ? Number(formData.weight) : null,
                        temperature: formData.temperature ? Number(formData.temperature) : null,
                        notes: formData.notes || ''
                    };
                    break;
                case 'bath':
                case 'memo':
                    details = {
                        notes: formData.notes || ''
                    };
                    break;
                default:
                    details = {
                        notes: formData.notes || ''
                    };
            }
            
            const activityData = {
                babyId: baby.id,
                type: formData.type as 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo' | 'bath',
                timestamp: timestamp,
                details: details
            };

            if (editingActivity) {
                // Update existing activity - for now just delete and recreate
                await firestore.deleteActivity(currentUser.uid, editingActivity.id);
                const savedActivity = await firestore.saveActivity(currentUser.uid, activityData);
                const localActivity = {
                    id: savedActivity.id,
                    type: savedActivity.type,
                    timestamp: savedActivity.timestamp,
                    details: savedActivity.details
                } as Activity;
                
                // Replace the edited activity in the list
                setActivities(activities?.map(activity => 
                    activity.id === editingActivity.id ? localActivity : activity
                ) || []);
                setSnackbar({
                    open: true,
                    message: firestore.isPendingWrite(savedActivity.id)
                        ? t('activities.snackbar.updatedOffline')
                        : t('activities.snackbar.updated'),
                    severity: firestore.isPendingWrite(savedActivity.id) ? 'info' : 'success'
                });
                setEditingActivity(null);
            } else {
                // Handle bulk registration or single activity creation
                if (isBulkMode && bulkTimes.length > 0) {
                    // Validate all times are filled and properly formatted
                    const validTimes = bulkTimes.filter(time => time.trim() !== '');
                    if (validTimes.length === 0) {
                        setSnackbar({
                            open: true,
                            message: t('activities.snackbar.enterAtLeastOneTime'),
                            severity: 'warning'
                        });
                        return;
                    }

                    // Check for duplicate times
                    const uniqueTimes = Array.from(new Set(validTimes));
                    if (uniqueTimes.length !== validTimes.length) {
                        setSnackbar({
                            open: true,
                            message: t('activities.snackbar.duplicateTimes'),
                            severity: 'warning'
                        });
                        return;
                    }

                    // Validate time format
                    const invalidTimes = validTimes.filter(time => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time));
                    if (invalidTimes.length > 0) {
                        setSnackbar({
                            open: true,
                            message: t('activities.snackbar.invalidTimes', { times: invalidTimes.join(', ') }),
                            severity: 'warning'
                        });
                        return;
                    }

                    // Create multiple activities for each valid time
                    const newActivities: Activity[] = [];
                    setBulkProgress({ total: validTimes.length, completed: 0, errors: [] });
                    
                    for (let i = 0; i < validTimes.length; i++) {
                        const time = validTimes[i];
                        try {
                            // Create timestamp for this specific time
                            const [hours, minutes] = time.split(':').map(Number);
                            const bulkTimestamp = new Date(selectedDate);
                            bulkTimestamp.setHours(hours, minutes, 0, 0);
                            
                            // Update activity data with the specific timestamp
                            const bulkActivityData = {
                                ...activityData,
                                timestamp: bulkTimestamp,
                                details: {
                                    ...details,
                                    time: bulkTimestamp
                                }
                            };

                            const savedActivity = await firestore.saveActivity(currentUser.uid, bulkActivityData);
                            const localActivity = {
                                id: savedActivity.id,
                                type: savedActivity.type,
                                timestamp: savedActivity.timestamp,
                                details: savedActivity.details
                            } as Activity;
                            
                            newActivities.push(localActivity);
                            setBulkProgress(prev => ({ ...prev, completed: prev.completed + 1 }));
                            
                        } catch (error) {
                            setBulkProgress(prev => ({ 
                                ...prev, 
                                errors: [...prev.errors, t('activities.bulk.errorAt', { time, message: error instanceof Error ? error.message : t('common.unknownError') })]
                            }));
                        }
                    }

                    // Add all new activities to the list
                    setActivities([...newActivities, ...(activities || [])]);
                    
                    const successCount = newActivities.length;
                    const offlineCount = newActivities.filter(activity => firestore.isPendingWrite(activity.id)).length;
                    const errorCount = validTimes.length - successCount;
                    
                    if (errorCount === 0) {
                        setSnackbar({
                            open: true,
                            message: offlineCount > 0
                                ? t('activities.snackbar.bulkCreatedWithOffline', { count: successCount, offline: offlineCount })
                                : t('activities.snackbar.bulkCreated', { count: successCount }),
                            severity: offlineCount > 0 ? 'info' : 'success'
                        });
                    } else {
                        setSnackbar({
                            open: true,
                            message: t('activities.snackbar.bulkPartial', { total: validTimes.length, success: successCount, failed: errorCount }),
                            severity: 'warning'
                        });
                    }
                } else {
                    // Create single new activity
                    const savedActivity = await firestore.saveActivity(currentUser.uid, activityData);
                    const localActivity = {
                        id: savedActivity.id,
                        type: savedActivity.type,
                        timestamp: savedActivity.timestamp,
                        details: savedActivity.details
                    } as Activity;
                    setActivities([localActivity, ...(activities || [])]);
                    // A short buzz confirms the save on phones that support it.
                    navigator.vibrate?.(15);
                    setSnackbar({
                        open: true,
                        message: firestore.isPendingWrite(savedActivity.id)
                            ? t('activities.snackbar.savedOffline')
                            : t('activities.snackbar.saved'),
                        severity: firestore.isPendingWrite(savedActivity.id) ? 'info' : 'success'
                    });
                }
            }
            
            // Reset form data
            setFormData({
                type: 'feeding',
                time: new Date().toTimeString().slice(0, 5),
                amount: '',
                duration: '',
                notes: '',
                weight: '',
                height: '',
                temperature: '',
                isUrine: true,
                isStool: false,
                stoolColor: [],
                stoolConsistency: 'bình thường',
                timestamp: undefined,
                foodType: 'milk',
                foodItem: '',
                isAllergic: false,
                foodPreference: 'normal'
            });
            
            // Reset bulk mode states
            if (isBulkMode) {
                setBulkTimes(['']);
                setIsBulkMode(false);
                setBulkProgress({ total: 0, completed: 0, errors: [] });
            }
            
            setHideActivityType(false);
            setShowForm(false);
        } catch (error) {
            setSnackbar({
                open: true,
                message: t('activities.snackbar.saveFailed'),
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    const getActivityTitle = (type: string) => {
        switch (type) {
            case 'feeding':
            case 'sleep':
            case 'diaper':
            case 'measurement':
            case 'bath':
            case 'memo':
                return t(`activities.addTitle.${type}`);
            default: return t('activities.addTitle.default');
        }
    };


    // WAKE WINDOW warning
    // Colour of the open sheet: matches the activity (milk blue, solid pink, diaper amber...).
    const formAccent = formData.type === 'feeding' && formData.foodType === 'solid'
        ? ACTIVITY_COLORS.solid
        : ACTIVITY_COLORS[formData.type] || ACTIVITY_COLORS.feeding;

    const wakeWindowWarning = useMemo(() => {
        if (!activities || activities.length === 0 || ongoingSleep) return null;

        // Chỉ hiển thị cảnh báo nếu đang xem ngày hôm nay
        const today = new Date();
        const isToday = selectedDate.getDate() === today.getDate() && 
                        selectedDate.getMonth() === today.getMonth() && 
                        selectedDate.getFullYear() === today.getFullYear();
        if (!isToday) return null;

        // Ưu tiên: nếu bé chưa có hoạt động ngủ nào hôm nay nhưng có từ hôm qua, thì list activities lấy All từ DB vẫn có data
        const sortedActivities = [...activities].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        const lastSleep = sortedActivities.find(a => a.type === 'sleep');
        
        if (lastSleep) {
            const wakeTime = new Date(lastSleep.timestamp);
            const now = currentTime || new Date();
            const diffMs = now.getTime() - wakeTime.getTime();
            
            // Nếu tương lai thì bỏ qua
            if (diffMs < 0) return null;

            const diffHours = diffMs / (1000 * 60 * 60);

            // Bé bù sữa/tã ở giữa thì vẫn thức, cứ tính Wake Window
            if (diffHours >= 2.5) {
                const hours = Math.floor(diffHours);
                const mins = Math.floor((diffHours - hours) * 60);
                return t('activities.wakeWindow.overtired', { duration: formatHoursMinutes(hours, mins) });
            } else if (diffHours >= 2) {
                const hours = Math.floor(diffHours);
                const mins = Math.floor((diffHours - hours) * 60);
                return t('activities.wakeWindow.sleepSoon', { duration: formatHoursMinutes(hours, mins) });
            }
        }
        return null;
    }, [activities, ongoingSleep, currentTime, selectedDate, t]);

    return (
        <ErrorBoundary>
        <Box sx={{ minHeight: 'auto', p: 0, bgcolor: '#f6f7f8', position: 'relative' }}>
            <Dialog
                open={showAiComposer}
                onClose={() => setShowAiComposer(false)}
                fullWidth
                maxWidth="sm"
                PaperProps={{ sx: { borderRadius: '24px', m: 2, width: 'calc(100% - 32px)' } }}
            >
                <DialogTitle sx={{ fontWeight: 700, fontSize: 20, pb: 0.5 }}>{t('assistant.recordWithAi')}</DialogTitle>
                <DialogContent sx={{ pt: '12px !important' }}>
                    <Typography sx={{ fontSize: 13, color: '#6b7f8a', mb: 1.5 }}>{t('assistant.hint')}</Typography>
                    <AssistantComposer
                        babyId={baby?.id}
                        selectedDate={selectedDate}
                        onCommitted={refreshActivities}
                    />
                </DialogContent>
                <DialogActions>
                    <MuiButton onClick={() => setShowAiComposer(false)}>{t('common.close')}</MuiButton>
                </DialogActions>
            </Dialog>
            <Box sx={{ px: { xs: 2, sm: 3 }, pt: 3, pb: 2, position: 'relative', zIndex: 1 }}>
                <Box>
                {/* WAKE WINDOWS WARNING BANNER */}
                {wakeWindowWarning && (
                    <Alert severity="warning" sx={{ mb: 1.5, py: 0.25, px: 1.5, bgcolor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '16px', '& .MuiAlert-message': { width: '100%', py: 0.25 } }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {t('activities.wakeWindow.label')} <Box component="span" sx={{ fontWeight: 400 }}>{wakeWindowWarning}</Box>
                        </Typography>
                    </Alert>
                )}

                <RecentDaysStrip
                    selectedDate={selectedDate}
                    onSelect={setSelectedDate}
                    onOpenCalendar={() => setShowHomeDatePicker((current) => !current)}
                />

                {showHomeDatePicker && (
                    <TextField
                        type="date"
                        size="small"
                        value={`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`}
                        onChange={(event) => {
                            const [year, month, day] = event.target.value.split('-').map(Number);
                            if (year && month && day) setSelectedDate(new Date(year, month - 1, day));
                        }}
                        sx={{ mb: 1.5, width: '100%' }}
                        inputProps={{ 'aria-label': t('common.selectDate') }}
                    />
                )}

                {/* Quick Actions - New Design */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h2" sx={{ mb: 2, fontSize: '20px', fontWeight: 700, color: '#101c22' }}>
                        {t('activities.heading')}
                    </Typography>
                    <Grid container spacing={1.5}>
                        {[
                            { 
                                label: t('activities.quick.milk'),
                                type: 'feeding', 
                                icon: (
                                    <MilkIcon sx={{ fontSize: 22 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.diaper'),
                                type: 'diaper', 
                                icon: (
                                    <BabyIcon sx={{ fontSize: 22 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.sleep'),
                                type: 'sleep', 
                                icon: (
                                    <SleepIcon sx={{ fontSize: 22 }} />
                                ),
                                isSleepTimer: true // Special flag for sleep timer
                            },
                            { 
                                label: t('activities.quick.bath'),
                                type: 'bath', 
                                icon: (
                                    <BathIcon sx={{ fontSize: 22 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.measurement'),
                                type: 'measurement', 
                                icon: (
                                    <MeasurementIcon sx={{ fontSize: 22 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.memo'),
                                type: 'memo', 
                                icon: (
                                    <MemoIcon sx={{ fontSize: 22 }} />
                                )
                            },
                        ].map(action => {
                            // Calculate time since last activity of this type
                            const getTimeSinceLastActivity = (type: string) => {
                                const typeActivities = (activities || []).filter(act => {
                                    let normalizedType = act.type;
                                    const actType = act.type as string;
                                    if (actType === 'sữa') normalizedType = 'feeding';
                                    else if (actType === 'ngủ') normalizedType = 'sleep';
                                    else if (actType === 'tã') normalizedType = 'diaper';
                                    else if (actType === 'số đo') normalizedType = 'measurement';
                                    else if (actType === 'ghi chú') normalizedType = 'memo';
                                    return normalizedType === type;
                                }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

                                if (typeActivities.length === 0) return null;

                                const lastActivity = typeActivities[0];
                                const lastTime = new Date(lastActivity.timestamp);
                                const now = currentTime; // Use currentTime state instead of new Date()
                                const diffMs = now.getTime() - lastTime.getTime();
                                const diffMinutes = diffMs / (1000 * 60);
                                const diffHours = diffMs / (1000 * 60 * 60);
                                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

                                if (diffDays > 0) return t('relative.daysAgo', { count: diffDays });
                                if (diffHours >= 1) {
                                    const wholeHours = Math.floor(diffHours);
                                    const restMinutes = Math.floor(diffMinutes - wholeHours * 60);
                                    return restMinutes > 0 && wholeHours < 10
                                        ? t('relative.hoursMinutesAgo', { hours: wholeHours, minutes: restMinutes })
                                        : t('relative.hoursAgo', { hours: wholeHours });
                                }
                                if (diffMinutes >= 1) return t('relative.minutesAgo', { count: Math.floor(diffMinutes) });
                                return t('relative.justNow');
                            };

                            const timeSince = getTimeSinceLastActivity(action.type);

                            return (
                            <Grid item xs={6} key={action.type}>
                                <Box
                                    onClick={() => {
                                        // Special handling for sleep timer
                                        if ((action as any).isSleepTimer) {
                                            if (ongoingSleep) {
                                                handleStopSleep();
                                            } else {
                                                handleStartSleep();
                                            }
                                            return;
                                        }

                                        // Regular activity handling
                                        setEditingActivity(null);
                                        setHideActivityType(true);
                                        const baseForm = {
                                            type: action.type as any,
                                            time: new Date().toTimeString().slice(0, 5),
                                            amount: '',
                                            duration: '',
                                            notes: '',
                                            weight: '',
                                            height: '',
                                            temperature: ''
                                        } as any;

                                        if (action.type === 'feeding') {
                                            // Start from the last bottle so a repeat feed is one tap on Save.
                                            const lastMilk = (activities || [])
                                                .filter((item) => item.type === 'feeding' && item.details?.foodType !== 'solid' && Number(item.details?.amount) > 0)
                                                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
                                            setFormData({ ...baseForm, foodType: 'milk', amount: lastMilk ? String(lastMilk.details.amount) : '' });
                                        } else if (action.type === 'diaper') {
                                            setFormData({
                                                ...baseForm,
                                                isUrine: true,
                                                isStool: false,
                                                stoolColor: ['vàng'],
                                                stoolConsistency: 'bình thường'
                                           
                                            });
                                        } else {
                                            setFormData(baseForm);
                                        }
                                        setShowForm(true);
                                    }}
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5,
                                        p: 1.5,
                                        minHeight: 72,
                                        bgcolor: (action as any).isSleepTimer && ongoingSleep ? '#fffbeb' : '#ffffff',
                                        borderRadius: '20px',
                                        border: (action as any).isSleepTimer && ongoingSleep
                                            ? '2px solid #f59e0b'
                                            : '1px solid #e5e7eb',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s, box-shadow 0.15s',
                                        '&:hover': { boxShadow: '0 6px 16px rgba(15, 23, 42, 0.06)' },
                                        '&:active': { transform: 'scale(0.98)' }
                                    }}
                                >
                                    <Box sx={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: ACTIVITY_COLORS[action.type],
                                        bgcolor: `${ACTIVITY_COLORS[action.type]}18`
                                    }}>
                                        {action.icon}
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#101c22', lineHeight: 1.3 }} noWrap>
                                            {(action as any).isSleepTimer && ongoingSleep ? t('activities.quick.wakeUp') : action.label}
                                        </Typography>
                                        {(action as any).isSleepTimer && ongoingSleep ? (
                                            <Typography sx={{ fontSize: 13, color: '#d97706', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }} noWrap>
                                                <TimerIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'text-bottom' }} />{Math.floor(sleepElapsedTime / 3600)}h {Math.floor((sleepElapsedTime % 3600) / 60)}m {sleepElapsedTime % 60}s
                                            </Typography>
                                        ) : (
                                            <Typography sx={{ fontSize: 12, color: timeSince ? '#6b7f8a' : '#b0b8bf', fontWeight: 500 }} noWrap>
                                                {timeSince || t('common.noData')}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            </Grid>
                            );
                        })}
                    </Grid>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 2 }}>
                    <DayStatsCard
                        title={t('home.summaryTitle')}
                        stats={calculateStatsForDate((activities || []) as any, selectedDate)}
                    />
                    <RecentActivityList
                        activities={(activities || []).filter((activity) => isSameLocalDay(new Date(activity.timestamp), selectedDate))}
                        onSeeAll={() => history.push('/timeline')}
                    />
                </Box>

                </Box>
            </Box>

            {/* Form Modal - Bottom Sheet Style */}
            {showForm && ReactDOM.createPortal(
                <div 
                    style={{ 
                        position: 'fixed', 
                        top: 0, 
                        left: 0, 
                        right: 0, 
                        bottom: 0, 
                        backgroundColor: 'rgba(0, 0, 0, 0.4)', 
                        zIndex: 9999, // Ensure modal is on top of BottomNav (z-index 1000)
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'center',
                        padding: 0,
                        overflow: 'hidden'
                    }}
                    onClick={() => {
                        setShowForm(false);
                        setHideActivityType(false);
                    }}
                >
                    <Box 
                        onClick={(e) => e.stopPropagation()}
                        sx={{
                            bgcolor: '#ffffff',
                            borderRadius: '28px 28px 0 0',
                            width: '100%',
                            maxWidth: { xs: '100%', sm: 600 },
                            minHeight: { xs: '50vh', sm: 'auto' },
                            maxHeight: { xs: '92vh', sm: '90vh' },
                            height: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.1)',
                            position: 'relative',
                            animation: 'slideUp 0.25s ease-out',
                            '@keyframes slideUp': {
                                from: { transform: 'translateY(100%)' },
                                to: { transform: 'translateY(0)' }
                            }
                        }}
                    >
                        {/* Drag Handle */}
                        <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            pt: 1.5, 
                            pb: 1,
                            cursor: 'pointer',
                            flexShrink: 0
                        }}>
                            <Box sx={{ 
                                width: 40, 
                                height: 4, 
                                bgcolor: '#e3e8eb', 
                                borderRadius: 2 
                            }} />
                        </Box>

                        {/* Header */}
                        <Box sx={{ px: 2, pb: 2, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Box sx={{
                                width: 44,
                                height: 44,
                                borderRadius: '50%',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: formAccent,
                                bgcolor: `${formAccent}18`,
                                '& svg': { fontSize: 22 }
                            }}>
                                {getActivityIcon({ type: formData.type, details: { foodType: formData.foodType } })}
                            </Box>
                            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 19, fontWeight: 700, color: '#101c22' }} noWrap>
                                {editingActivity ? t('activities.editTitle') : getActivityTitle(formData.type)}
                            </Typography>
                            {!editingActivity && (
                                <Box
                                    component="button"
                                    type="button"
                                    aria-pressed={isBulkMode}
                                    onClick={() => {
                                        setIsBulkMode(!isBulkMode);
                                        if (!isBulkMode) {
                                            setBulkTimes([formData.time]);
                                        }
                                    }}
                                    sx={{
                                        flexShrink: 0,
                                        height: 40,
                                        px: 1.5,
                                        borderRadius: '999px',
                                        border: `1.5px solid ${isBulkMode ? '#13a4ec' : '#e2e8f0'}`,
                                        bgcolor: isBulkMode ? '#e0f2fe' : '#ffffff',
                                        color: isBulkMode ? '#0369a1' : '#64748b',
                                        fontFamily: 'inherit',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {t('activities.bulk.label')}
                                </Box>
                            )}
                            <IconButton
                                aria-label={t('common.close')}
                                onClick={() => {
                                    setShowForm(false);
                                    setHideActivityType(false);
                                }}
                                sx={{ flexShrink: 0, bgcolor: '#f1f5f9', width: 40, height: 40, '&:hover': { bgcolor: '#e2e8f0' } }}
                            >
                                <CloseIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                        </Box>

                        {/* Form Content - Scrollable */}
                        <Box 
                            component="form" 
                            id="activity-form"
                            onSubmit={handleSubmit} 
                            sx={{ 
                                px: { xs: 2, sm: 3 }, 
                                pb: { xs: 2, sm: 3 },
                                flex: 1,
                                overflowY: 'auto',
                                overflowX: 'hidden',
                                WebkitOverflowScrolling: 'touch',
                                '&::-webkit-scrollbar': {
                                    width: '4px'
                                },
                                '&::-webkit-scrollbar-track': {
                                    background: 'transparent'
                                },
                                '&::-webkit-scrollbar-thumb': {
                                    background: '#e3e8eb',
                                    borderRadius: '2px'
                                }
                            }}
                        >
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                {/* Activity Type Select - Hidden when opened from quick action */}
                                {!hideActivityType && (
                                    <FormControl fullWidth>
                                        <InputLabel id="activity-type-label" sx={{ color: '#6b7f8a' }}>{t('activities.form.type')}</InputLabel>
                                        <Select
                                            labelId="activity-type-label"
                                            value={formData.type}
                                            label={t('activities.form.type')}
                                            onChange={(e) => {
                                                const newType = e.target.value as any;
                                                if (newType === 'diaper') {
                                                    setFormData({
                                                        ...formData,
                                                        type: newType,
                                                        isUrine: formData.isUrine ?? true,
                                                        isStool: formData.isStool ?? false,
                                                        stoolColor: Array.isArray(formData.stoolColor) ? formData.stoolColor : (formData.stoolColor ? [formData.stoolColor] : []),
                                                        stoolConsistency: formData.stoolConsistency ?? 'bình thường'
                                                    });
                                                } else {
                                                    setFormData({ ...formData, type: newType });
                                                }
                                            }}
                                            sx={{
                                                bgcolor: '#f1f5f9',
                                                borderRadius: '14px',
                                                '& .MuiOutlinedInput-notchedOutline': {
                                                    border: 'none'
                                                },
                                                '&:hover .MuiOutlinedInput-notchedOutline': {
                                                    border: 'none'
                                                },
                                                '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                                    border: '2px solid #13a4ec'
                                                }
                                            }}
                                            MenuProps={{
                                                disableScrollLock: true,
                                                sx: { zIndex: 13000 },
                                                PaperProps: {
                                                    sx: { 
                                                        borderRadius: '12px',
                                                        marginTop: '8px'
                                                    }
                                                }
                                            }}
                                        >
                                            <MenuItem value="feeding">🍼 {t('activityTypes.feeding')}</MenuItem>
                                            <MenuItem value="sleep">😴 {t('activityTypes.sleep')}</MenuItem>
                                            <MenuItem value="diaper">👶 {t('activities.form.diaperChange')}</MenuItem>
                                            <MenuItem value="bath">🛁 {t('activityTypes.bath')}</MenuItem>
                                            <MenuItem value="measurement">📏 {t('activityTypes.measurement')}</MenuItem>
                                            <MenuItem value="memo">📝 {t('activityTypes.memo')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                )}

                                {/* Time Input - Single or Multiple */}
                                {formData.type !== 'sleep' && (!isBulkMode ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                        <SectionLabel>{t('activities.form.time')}</SectionLabel>
                                        <input
                                            type="time"
                                            aria-label={t('activities.form.time')}
                                            value={formData.time}
                                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                            style={nativeTimeInputStyle}
                                        />
                                    </Box>
                                ) : (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#101c22', fontSize: '14px' }}>
                                            {t('activities.form.timesBulk')}
                                        </Typography>
                                        {bulkTimes.map((time, index) => (
                                            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <TextField
                                                    type="time"
                                                    value={time}
                                                    onChange={(e) => {
                                                        const newTimes = [...bulkTimes];
                                                        newTimes[index] = e.target.value;
                                                        setBulkTimes(newTimes);
                                                    }}
                                                    InputLabelProps={{ shrink: true }}
                                                    inputProps={{ step: 60 }}
                                                    variant="filled" hiddenLabel sx={{ ...fieldSx, flex: 1 }}
                                                />
                                                <IconButton 
                                                    onClick={() => {
                                                        const newTimes = bulkTimes.filter((_, i) => i !== index);
                                                        setBulkTimes(newTimes);
                                                    }}
                                                    disabled={bulkTimes.length <= 1}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: '#f6f7f8',
                                                        color: '#ff4444',
                                                        '&:hover': {
                                                            bgcolor: '#ffe5e5'
                                                        },
                                                        '&.Mui-disabled': {
                                                            bgcolor: '#f6f7f8',
                                                            color: '#c0c0c0'
                                                        }
                                                    }}
                                                >
                                                    🗑️
                                                </IconButton>
                                            </Box>
                                        ))}
                                        <MuiButton
                                            variant="outlined"
                                            onClick={() => setBulkTimes([...bulkTimes, ''])}
                                            size="small"
                                            sx={{ 
                                                alignSelf: 'flex-start',
                                                borderColor: '#e5e7eb',
                                                color: '#13a4ec',
                                                fontSize: '13px',
                                                fontWeight: 600,
                                                '&:hover': {
                                                    borderColor: '#13a4ec',
                                                    bgcolor: 'rgba(19, 164, 236, 0.05)'
                                                }
                                            }}
                                        >
                                            + {t('activities.form.addTime')}
                                        </MuiButton>
                                    </Box>
                                ))}

                                {/* Diaper: what was in it, then stool details */}
                                {formData.type === 'diaper' && (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        <Box>
                                            <SectionLabel>{t('diaper.kind')}</SectionLabel>
                                            <SegmentedControl
                                                color={ACTIVITY_COLORS.diaper}
                                                value={formData.isUrine && formData.isStool ? 'both' : formData.isStool ? 'stool' : 'urine'}
                                                onChange={(kind) => setFormData({
                                                    ...formData,
                                                    isUrine: kind !== 'stool',
                                                    isStool: kind !== 'urine',
                                                    stoolColor: kind !== 'urine' && !(formData.stoolColor && formData.stoolColor.length) ? ['vàng'] : formData.stoolColor
                                                })}
                                                options={[
                                                    { value: 'urine', label: t('diaper.urine') },
                                                    { value: 'stool', label: t('diaper.stool') },
                                                    { value: 'both', label: t('diaper.both') }
                                                ]}
                                            />
                                        </Box>

                                        {formData.isStool && (
                                            <>
                                                <Box>
                                                    <SectionLabel>{t('diaper.colorLabel')}</SectionLabel>
                                                    <ChoiceChips
                                                        color={ACTIVITY_COLORS.diaper}
                                                        selected={Array.isArray(formData.stoolColor) ? formData.stoolColor : []}
                                                        onToggle={(color) => {
                                                            const prev = Array.isArray(formData.stoolColor) ? formData.stoolColor : [];
                                                            setFormData({
                                                                ...formData,
                                                                stoolColor: prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]
                                                            });
                                                        }}
                                                        options={[
                                                            { value: 'vàng' as const, label: t('diaper.color.yellow'), dot: '#facc15' },
                                                            { value: 'nâu' as const, label: t('diaper.color.brown'), dot: '#92400e' },
                                                            { value: 'xám' as const, label: t('diaper.color.gray'), dot: '#9ca3af' }
                                                        ]}
                                                    />
                                                </Box>
                                                <Box>
                                                    <SectionLabel>{t('diaper.consistency.label')}</SectionLabel>
                                                    <SegmentedControl
                                                        color={ACTIVITY_COLORS.diaper}
                                                        value={formData.stoolConsistency || 'bình thường'}
                                                        onChange={(value) => setFormData({ ...formData, stoolConsistency: value })}
                                                        options={[
                                                            { value: 'lỏng', label: t('diaper.consistency.loose') },
                                                            { value: 'bình thường', label: t('diaper.consistency.normal') },
                                                            { value: 'khô', label: t('diaper.consistency.hard') }
                                                        ]}
                                                    />
                                                </Box>
                                            </>
                                        )}
                                    </Box>
                                )}

                                {/* Feeding Type Tabs */}
                                {formData.type === 'feeding' && (
                                    <Box sx={{ width: '100%' }}>
                                        <Box sx={{ mb: 2 }}>
                                            <SegmentedControl
                                                color={formData.foodType === 'solid' ? ACTIVITY_COLORS.solid : ACTIVITY_COLORS.feeding}
                                                value={formData.foodType === 'solid' ? 'solid' : 'milk'}
                                                onChange={(value) => setFormData({ ...formData, foodType: value })}
                                                options={[
                                                    { value: 'milk', label: t('feeding.milk'), icon: <MilkIcon /> },
                                                    { value: 'solid', label: t('feeding.solid'), icon: <FoodIcon /> }
                                                ]}
                                            />
                                        </Box>

                                        {formData.foodType !== 'solid' ? (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                            <ChoiceChips
                                                color={ACTIVITY_COLORS.feeding}
                                                selected={[Number(formData.amount)]}
                                                onToggle={(amount) => setFormData({ ...formData, amount: String(amount) })}
                                                options={milkAmountSuggestions.map((amount) => ({ value: amount, label: `${amount}ml` }))}
                                            />
                                            <TextField
                                                InputProps={{ endAdornment: <InputAdornment position="end">ml</InputAdornment> }}
                                                label={t('feeding.amountMl')}
                                                type="number"
                                                inputMode="decimal"
                                                inputProps={{ inputMode: 'decimal', pattern: '[0-9]*' }}
                                                value={formData.amount}
                                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                                fullWidth
                                                variant="filled" sx={fieldSx}
                                            />
                                            </Box>
                                        ) : (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                {foodItems.length > 0 && (
                                                    <Box>
                                                        <Typography sx={{ fontSize: '12px', fontWeight: 600, color: '#6b7f8a', mb: 0.75 }}>
                                                            {t('feeding.recentFoods')}
                                                        </Typography>
                                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                                            {foodItems.slice(0, RECENT_FOOD_CHIP_COUNT).map((item) => {
                                                                const selected = formData.foodItem === item;
                                                                return (
                                                                    <Chip
                                                                        key={item}
                                                                        label={item}
                                                                        onClick={() => {
                                                                            setFormData(prev => ({ ...prev, foodItem: item }));
                                                                            setFoodMenuOpen(false);
                                                                        }}
                                                                        sx={{
                                                                            maxWidth: '100%',
                                                                            fontWeight: 600,
                                                                            color: selected ? '#ffffff' : '#334155',
                                                                            bgcolor: selected ? ACTIVITY_COLORS.solid : '#f1f5f9',
                                                                            '&:hover': { bgcolor: selected ? ACTIVITY_COLORS.solid : '#e2e8f0' }
                                                                        }}
                                                                    />
                                                                );
                                                            })}
                                                        </Box>
                                                    </Box>
                                                )}
                                                <Autocomplete
                                                    freeSolo
                                                    disablePortal={false}
                                                    selectOnFocus
                                                    clearOnBlur
                                                    handleHomeEndKeys
                                                    options={foodItems}
                                                    filterOptions={(options, state) => filterFoodItems(options, state.inputValue)}
                                                    value={formData.foodItem || ''}
                                                    open={foodMenuOpen}
                                                    onOpen={() => setFoodMenuOpen(true)}
                                                    onClose={() => setFoodMenuOpen(false)}
                                                    onChange={(_, newValue) => {
                                                        setFormData(prev => ({ ...prev, foodItem: newValue || '' }));
                                                    }}
                                                    onInputChange={(_, newInputValue, reason) => {
                                                        setFormData(prev => ({ ...prev, foodItem: newInputValue }));
                                                        // Only typing opens the list; picking a chip must not.
                                                        if (reason === 'input') setFoodMenuOpen(true);
                                                    }}
                                                    ListboxProps={{
                                                        sx: {
                                                            WebkitOverflowScrolling: 'touch',
                                                            maxHeight: '250px'
                                                        }
                                                    }}
                                                    slotProps={{
                                                        popper: {
                                                            sx: { zIndex: 13000 }
                                                        }
                                                    }}
                                                    renderInput={(params) => (
                                                        <TextField
                                                            {...params}
                                                            label={t('feeding.foodName')}
                                                            placeholder={t('feeding.foodNamePlaceholder')}
                                                            onFocus={() => {
                                                                // Scroll the Autocomplete element into view, aligning it to the top or center of viewport
                                                                setTimeout(() => {
                                                                    const element = document.activeElement;
                                                                    if (element) {
                                                                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                                    }
                                                                }, 300); // Slight delay to allow keyboard to appear
                                                            }}
                                                            variant="filled" sx={fieldSx}
                                                        />
                                                    )}
                                                />
                                                <TextField
                                                    label={t('feeding.amountG')}
                                                    type="number"
                                                    inputMode="decimal"
                                                    inputProps={{ inputMode: 'decimal', pattern: '[0-9]*' }}
                                                    value={formData.amount}
                                                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                                    fullWidth
                                                    variant="filled" sx={fieldSx}
                                                />
                                                <Box>
                                                    <SectionLabel>{t('feeding.reaction.label')}</SectionLabel>
                                                    <ChoiceChips
                                                        color={ACTIVITY_COLORS.solid}
                                                        selected={[formData.foodPreference ?? 'normal']}
                                                        onToggle={(value) => setFormData(prev => ({ ...prev, foodPreference: value }))}
                                                        options={[
                                                            { value: 'enthusiastic' as const, label: t('feeding.reaction.enthusiastic') },
                                                            { value: 'normal' as const, label: t('feeding.reaction.normal') },
                                                            { value: 'dislike' as const, label: t('feeding.reaction.dislike') },
                                                            { value: 'allergic' as const, label: t('feeding.reaction.allergic'), danger: true }
                                                        ]}
                                                    />
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                )}

                                {/* Sleep Duration and Time Fields */}
                                {formData.type === 'sleep' && (
                                    <>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                            <Box sx={{ flex: 1 }}>
                                                <SectionLabel>{t('sleep.startTime')}</SectionLabel>
                                                <TextField
                                                    type="time"
                                                    value={(() => {
                                                        if (formData.notes && /(?:Bắt đầu|開始):/.test(formData.notes)) {
                                                            const match = formData.notes.match(/(?:Bắt đầu|開始): (\d{1,2}):(\d{2}):(\d{2})/);
                                                            if (match) {
                                                                return `${match[1].padStart(2, '0')}:${match[2]}`;
                                                            }
                                                        }
                                                        // Default to current time minus duration
                                                        const now = new Date();
                                                        const durationMinutes = parseInt(formData.duration) || 0;
                                                        const startTime = new Date(now.getTime() - durationMinutes * 60000);
                                                        return startTime.toTimeString().slice(0, 5);
                                                    })()}
                                                    onChange={(e) => {
                                                        const newStartTime = e.target.value; // HH:MM format
                                                        // Update notes with new start time
                                                        let newNotes = formData.notes || '';
                                                        if (/(?:Bắt đầu|開始):/.test(newNotes)) {
                                                            newNotes = newNotes.replace(/(?:Bắt đầu|開始): \d{1,2}:\d{2}:\d{2}/, `開始: ${newStartTime}:00`);
                                                        } else {
                                                            newNotes = (newNotes ? newNotes.trim() + '\n' : '') + `開始: ${newStartTime}:00`;
                                                        }

                                                        // Calculate new duration
                                                        let newDuration = formData.duration;
                                                        
                                                        // Get End Time
                                                        let endTimeStr = '';
                                                        if (formData.timestamp) {
                                                             endTimeStr = new Date(formData.timestamp).toTimeString().slice(0, 5);
                                                        } else if (editingActivity) {
                                                            endTimeStr = new Date(editingActivity.timestamp).toTimeString().slice(0, 5);
                                                        } else {
                                                            endTimeStr = new Date().toTimeString().slice(0, 5);
                                                        }

                                                        if (newStartTime && endTimeStr) {
                                                            const [startH, startM] = newStartTime.split(':').map(Number);
                                                            const [endH, endM] = endTimeStr.split(':').map(Number);
                                                            
                                                            let startMinutes = startH * 60 + startM;
                                                            let endMinutes = endH * 60 + endM;
                                                            
                                                            // Handle overnight (if end time is earlier than start time, assume next day)
                                                            if (endMinutes < startMinutes) {
                                                                endMinutes += 24 * 60;
                                                            }
                                                            
                                                            newDuration = (endMinutes - startMinutes).toString();
                                                        }

                                                        setFormData({ ...formData, notes: newNotes, duration: newDuration });
                                                    }}
                                                    fullWidth
                                                    variant="filled" hiddenLabel sx={fieldSx}
                                                />
                                            </Box>
                                            <Box sx={{ flex: 1 }}>
                                                <SectionLabel>{t('sleep.endTimeWake')}</SectionLabel>
                                                <TextField
                                                    type="time"
                                                    value={(() => {
                                                        // Use the activity timestamp as end time
                                                        if (formData.timestamp) {
                                                            return new Date(formData.timestamp).toTimeString().slice(0, 5);
                                                        }
                                                        if (editingActivity) {
                                                            const endTime = new Date(editingActivity.timestamp);
                                                            return endTime.toTimeString().slice(0, 5);
                                                        }
                                                        return new Date().toTimeString().slice(0, 5);
                                                    })()}
                                                    onChange={(e) => {
                                                        // This will update the activity timestamp
                                                        const newEndTime = e.target.value; // HH:MM format
                                                        const [hours, minutes] = newEndTime.split(':');
                                                        const newTimestamp = new Date(selectedDate);
                                                        newTimestamp.setHours(parseInt(hours), parseInt(minutes), 0, 0);
                                                        
                                                        // Calculate new duration
                                                        let newDuration = formData.duration;
                                                        
                                                        // Get Start Time
                                                        let startTimeStr = '';
                                                        let currentNotes = formData.notes || '';
                                                        
                                                        if (/(?:Bắt đầu|開始):/.test(currentNotes)) {
                                                            const match = currentNotes.match(/(?:Bắt đầu|開始): (\d{1,2}):(\d{2}):(\d{2})/);
                                                            if (match) {
                                                                startTimeStr = `${match[1].padStart(2, '0')}:${match[2]}`;
                                                            }
                                                        } else {
                                                            // Calculate implicit start time
                                                            let oldEndTime;
                                                            if (formData.timestamp) oldEndTime = new Date(formData.timestamp);
                                                            else if (editingActivity) oldEndTime = new Date(editingActivity.timestamp);
                                                            else oldEndTime = new Date();
                                                            
                                                            const durationMinutes = parseInt(formData.duration) || 0;
                                                            const implicitStartTime = new Date(oldEndTime.getTime() - durationMinutes * 60000);
                                                            startTimeStr = implicitStartTime.toTimeString().slice(0, 5);
                                                        }
                                                        
                                                        if (startTimeStr && newEndTime) {
                                                            const [startH, startM] = startTimeStr.split(':').map(Number);
                                                            const [endH, endM] = newEndTime.split(':').map(Number);
                                                            
                                                            let startMinutes = startH * 60 + startM;
                                                            let endMinutes = endH * 60 + endM;
                                                            
                                                            // Handle overnight
                                                            if (endMinutes < startMinutes) {
                                                                endMinutes += 24 * 60;
                                                            }
                                                            
                                                            newDuration = (endMinutes - startMinutes).toString();
                                                        }

                                                        // Ensure start time is recorded in notes
                                                        if (!/(?:Bắt đầu|開始):/.test(currentNotes)) {
                                                            currentNotes = (currentNotes ? currentNotes.trim() + '\n' : '') + `開始: ${startTimeStr}:00`;
                                                        }

                                                        setFormData({ ...formData, timestamp: newTimestamp.toISOString(), duration: newDuration, notes: currentNotes });
                                                    }}
                                                    fullWidth
                                                    variant="filled" hiddenLabel sx={fieldSx}
                                                />
                                            </Box>
                                        </Box>
                                        <TextField
                                            label={t('sleep.durationMinutes')}
                                            type="number"
                                            value={formData.duration}
                                            disabled={true}
                                            fullWidth
                                            variant="filled" sx={fieldSx}
                                        />
                                    </>
                                )}

                                {/* Measurement Fields */}
                                {formData.type === 'measurement' && (
                                    <>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                            <TextField
                                                label={t('measurement.weightG')}
                                                type="number"
                                                value={formData.weight}
                                                onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                                fullWidth
                                                variant="filled" sx={fieldSx}
                                            />
                                            <TextField
                                                label={t('measurement.heightCm')}
                                                type="number"
                                                value={formData.height}
                                                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                                fullWidth
                                                variant="filled" sx={fieldSx}
                                            />
                                        </Box>
                                        <TextField
                                            label={t('measurement.temperatureC')}
                                            type="number"
                                            value={formData.temperature}
                                            onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                                            fullWidth
                                            variant="filled" sx={fieldSx}
                                        />
                                    </>
                                )}

                                {/* Notes Field */}
                                {(formData.type === 'feeding' || formData.type === 'sleep' || formData.type === 'diaper' || formData.type === 'measurement' || formData.type === 'memo' || formData.type === 'bath') && (
                                    <TextField
                                        label={t('common.notes')}
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        fullWidth
                                        multiline
                                        minRows={2}
                                        variant="filled" sx={fieldSx}
                                    />
                                    )}

                                {/* Bulk Progress - New Design */}
                                {isBulkMode && bulkProgress.total > 0 && (
                                    <Box sx={{ 
                                        p: 2, 
                                        bgcolor: '#f6f7f8', 
                                        borderRadius: '12px', 
                                        border: '1px solid #e5e7eb' 
                                    }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#101c22', mb: 1.5, fontSize: '14px' }}>
                                            {t('activities.bulk.progress', { completed: bulkProgress.completed, total: bulkProgress.total })}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ flex: 1 }}>
                                                <div 
                                                    style={{
                                                        width: '100%',
                                                        height: 8,
                                                        backgroundColor: '#e3e8eb',
                                                        borderRadius: 4,
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    <div 
                                                        style={{
                                                            width: `${(bulkProgress.completed / bulkProgress.total) * 100}%`,
                                                            height: '100%',
                                                            backgroundColor: bulkProgress.errors.length > 0 ? '#ff9800' : '#13a4ec',
                                                            transition: 'width 0.3s ease'
                                                        }}
                                                    />
                                                </div>
                                            </Box>
                                            <Typography variant="body2" sx={{ color: '#6b7f8a', fontSize: '13px', fontWeight: 600 }}>
                                                {Math.round((bulkProgress.completed / bulkProgress.total) * 100)}%
                                            </Typography>
                                        </Box>
                                        {bulkProgress.errors.length > 0 && (
                                            <Box sx={{ mt: 1.5 }}>
                                                <Typography variant="caption" sx={{ color: '#ff4444', display: 'block', fontWeight: 600 }}>
                                                    ⚠️ {t('activities.bulk.errors', { count: bulkProgress.errors.length })}
                                                </Typography>
                                                {bulkProgress.errors.slice(0, 3).map((error, index) => (
                                                    <Typography key={index} variant="caption" sx={{ color: '#ff4444', display: 'block', ml: 1, fontSize: '12px' }}>
                                                        • {error}
                                                    </Typography>
                                                ))}
                                                {bulkProgress.errors.length > 3 && (
                                                    <Typography variant="caption" sx={{ color: '#ff4444', display: 'block', ml: 1, fontSize: '12px' }}>
                                                        • {t('activities.bulk.moreErrors', { count: bulkProgress.errors.length - 3 })}
                                                    </Typography>
                                                )}
                                            </Box>
                                        )}
                                    </Box>
                                )}
                            </Box>
                        </Box>

                        {/* Action Buttons - Sticky Footer */}
                        <Box sx={{ 
                            px: { xs: 2, sm: 3 }, 
                            pb: { 
                                xs: 'calc(16px + env(safe-area-inset-bottom))', 
                                sm: 3 
                            },
                            pt: 2,
                            borderTop: '1px solid #f1f5f9',
                            bgcolor: '#ffffff',
                            flexShrink: 0,
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 10
                        }}>
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                <MuiButton
                                    onClick={() => {
                                        setShowForm(false);
                                        setHideActivityType(false);
                                    }}
                                    variant="text"
                                    fullWidth
                                    sx={{
                                        borderRadius: '14px',
                                        height: 52,
                                        bgcolor: '#f1f5f9',
                                        color: '#334155',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        fontSize: { xs: '14px', sm: '16px' },
                                        '&:hover': { bgcolor: '#e2e8f0' }
                                    }}
                                >
                                    {t('common.cancel')}
                                </MuiButton>
                                <MuiButton
                                    type="submit"
                                    form="activity-form"
                                    variant="contained"
                                    fullWidth
                                    disabled={loading}
                                    sx={{
                                        borderRadius: '14px',
                                        height: 52,
                                        bgcolor: formAccent,
                                        boxShadow: 'none',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        fontSize: { xs: '14px', sm: '16px' },
                                        '&:hover': {
                                            bgcolor: formAccent,
                                            filter: 'brightness(0.95)',
                                            boxShadow: 'none'
                                        },
                                        '&:disabled': {
                                            bgcolor: '#e3e8eb',
                                            color: '#6b7f8a'
                                        }
                                    }}
                                >
                                    {loading && isBulkMode 
                                        ? t('activities.bulk.creating', { completed: bulkProgress.completed, total: bulkProgress.total })
                                        : editingActivity 
                                            ? t('common.save') 
                                            : isBulkMode 
                                                ? t('activities.bulk.createCount', { count: bulkTimes.filter(time => time.trim()).length })
                                                : t('common.save')
                                    }
                                </MuiButton>
                            </Box>
                        </Box>
                    </Box>
                </div>,
                document.body
            )}

            {/* Snackbar for notifications */}
            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ ...snackbar, open: false })}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                sx={{ bottom: { xs: 'calc(96px + env(safe-area-inset-bottom))' } }}
            >
                <Alert
                    onClose={() => setSnackbar({ ...snackbar, open: false })}
                    severity={snackbar.severity}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

        </Box>
        </ErrorBoundary>
    );
};

export default ActivitiesPage;
