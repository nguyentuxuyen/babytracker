import React, { useState, useEffect, useMemo, useRef, Component, ReactNode } from 'react';
import ReactDOM from 'react-dom';
import { useHistory, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Box, Typography, Button as MuiButton, TextField, MenuItem, Select, InputLabel, FormControl, IconButton, Grid, Snackbar, Alert, Checkbox, FormControlLabel, Tabs, Tab, Autocomplete, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import { AssistantComposer } from '../components/common/AssistantComposer';
import RecentDaysStrip from '../components/common/RecentDaysStrip';
import { BabyIcon, BathIcon, MeasurementIcon, MemoIcon, MilkIcon, SleepIcon, TimerIcon } from '../components/common/icons';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { filterFoodItems } from '../utils/foodSearch';
import i18n from '../i18n';
import { formatHoursMinutes } from '../i18n/format';

const RECENT_FOOD_CHIP_COUNT = 8;

// 1. ĐỊNH NGHĨA STYLE LIQUID GLASS (Dùng chung)
const liquidGlassStyle = {
    background: 'rgba(255, 255, 255, 0.94)',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
    border: '1px solid rgba(255, 255, 255, 0.5)', // Viền trắng phát sáng nhẹ
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.1)', // Bóng đổ màu xanh tím nhẹ tạo chiều sâu
    borderRadius: '24px', // Bo góc lớn mềm mại
    transition: 'all 0.3s ease', // Hiệu ứng chuyển động mượt như nước
};

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
                message: savedActivity.id.startsWith('offline-')
                    ? t('activities.snackbar.sleepSavedOffline', { count: duration })
                    : t('activities.snackbar.sleepSaved', { count: duration }),
                severity: savedActivity.id.startsWith('offline-') ? 'info' : 'success'
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
                    message: savedActivity.id.startsWith('offline-')
                        ? t('activities.snackbar.updatedOffline')
                        : t('activities.snackbar.updated'),
                    severity: savedActivity.id.startsWith('offline-') ? 'info' : 'success'
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
                    const offlineCount = newActivities.filter(activity => activity.id.startsWith('offline-')).length;
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
                    setSnackbar({
                        open: true,
                        message: savedActivity.id.startsWith('offline-')
                            ? t('activities.snackbar.savedOffline')
                            : t('activities.snackbar.saved'),
                        severity: savedActivity.id.startsWith('offline-') ? 'info' : 'success'
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


    // Error boundary effect
    useEffect(() => {
        const handleError = (error: ErrorEvent) => {
            // Don't let the error crash the app
            return true;
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            event.preventDefault();
        };

        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    // WAKE WINDOW warning
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
        <Box sx={{
            minHeight: 'auto',
            p: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            // 2. TẠO NỀN FLUID (QUAN TRỌNG ĐỂ THẤY HIỆU ỨNG KÍNH)
            background: '#f0f4f8',
            position: 'relative',
            overflow: 'hidden',
            // Blob 1: Màu xanh
            '&::before': {
                content: '""',
                position: 'fixed',
                top: '-10%',
                left: '-10%',
                width: '60%',
                height: '60%',
                borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%', // Hình dáng méo mó tự nhiên
                background: 'linear-gradient(135deg, #a5f3fc 0%, #3b82f6 100%)',
                filter: 'blur(60px)',
                opacity: 0.6,
                zIndex: 0,
                animation: 'float 10s infinite ease-in-out'
            },
            // Blob 2: Màu cam/hồng
            '&::after': {
                content: '""',
                position: 'fixed',
                bottom: '-10%',
                right: '-10%',
                width: '60%',
                height: '60%',
                borderRadius: '60% 40% 30% 70% / 60% 50% 40% 50%',
                background: 'linear-gradient(135deg, #fde68a 0%, #f472b6 100%)',
                filter: 'blur(60px)',
                opacity: 0.5,
                zIndex: 0,
                animation: 'float 12s infinite ease-in-out reverse'
            },
            '@keyframes float': {
                '0%': { transform: 'translate(0, 0) rotate(0deg)' },
                '50%': { transform: 'translate(20px, 20px) rotate(5deg)' },
                '100%': { transform: 'translate(0, 0) rotate(0deg)' }
            }
        }}
        >
            <Dialog open={showAiComposer} onClose={() => setShowAiComposer(false)} fullWidth maxWidth="sm">
                <DialogTitle>{t('assistant.recordWithAi')}</DialogTitle>
                <DialogContent sx={{ pt: 1 }}>
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
                    <Alert severity="warning" sx={{ mb: 1.5, py: 0.25, px: 1.25, ...liquidGlassStyle, borderRadius: '12px', '& .MuiAlert-message': { width: '100%', py: 0.25 } }}>
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
                    <Grid container spacing={2}>
                        {[
                            { 
                                label: t('activities.quick.milk'),
                                type: 'feeding', 
                                icon: (
                                    <MilkIcon sx={{ fontSize: 24, color: '#13a4ec', flexShrink: 0 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.diaper'),
                                type: 'diaper', 
                                icon: (
                                    <BabyIcon sx={{ fontSize: 24, color: '#13a4ec', flexShrink: 0 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.sleep'),
                                type: 'sleep', 
                                icon: (
                                    <SleepIcon sx={{ fontSize: 24, color: '#13a4ec', flexShrink: 0 }} />
                                ),
                                isSleepTimer: true // Special flag for sleep timer
                            },
                            { 
                                label: t('activities.quick.bath'),
                                type: 'bath', 
                                icon: (
                                    <BathIcon sx={{ fontSize: 24, color: '#13a4ec', flexShrink: 0 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.measurement'),
                                type: 'measurement', 
                                icon: (
                                    <MeasurementIcon sx={{ fontSize: 24, color: '#13a4ec', flexShrink: 0 }} />
                                )
                            },
                            { 
                                label: t('activities.quick.memo'),
                                type: 'memo', 
                                icon: (
                                    <MemoIcon sx={{ fontSize: 24, color: '#13a4ec', flexShrink: 0 }} />
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
                                if (diffHours >= 1) return t('relative.hoursAgo', { hours: diffHours.toFixed(1) });
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

                                        if (action.type === 'diaper') {
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
                                        flexDirection: 'column',
                                        gap: 1,
                                        p: 2,
                                        // Style kính trong cho nút bấm
                                        bgcolor: (action as any).isSleepTimer && ongoingSleep 
                                            ? 'rgba(254, 243, 199, 0.7)' 
                                            : 'rgba(255, 255, 255, 0.5)',
                                        backdropFilter: 'none',
                                        borderRadius: '20px',
                                        border: (action as any).isSleepTimer && ongoingSleep 
                                            ? '2px solid #f59e0b' 
                                            : '1px solid rgba(255, 255, 255, 0.6)',
                                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: 'rgba(255, 255, 255, 0.7)',
                                            transform: 'translateY(-2px)',
                                            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.06)'
                                        }
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        {action.icon}
                                        <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#101c22' }}>
                                            {(action as any).isSleepTimer && ongoingSleep ? t('activities.quick.wakeUp') : action.label}
                                        </Typography>
                                    </Box>
                                    {(action as any).isSleepTimer && ongoingSleep ? (
                                        <Typography sx={{ 
                                            fontSize: '14px', 
                                            color: '#f59e0b',
                                            fontWeight: 600,
                                            pl: 5
                                        }}>
                                            <TimerIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />{Math.floor(sleepElapsedTime / 3600)}h {Math.floor((sleepElapsedTime % 3600) / 60)}m {sleepElapsedTime % 60}s
                                        </Typography>
                                    ) : timeSince ? (
                                        <Typography sx={{ 
                                            fontSize: '12px', 
                                            color: '#9ca3af',
                                            fontWeight: 500,
                                            pl: 5
                                        }}>
                                            {timeSince}
                                        </Typography>
                                    ) : (
                                        <Typography sx={{ 
                                            fontSize: '12px',
                                            color: '#b0b8bf',
                                            fontWeight: 500,
                                            pl: 5
                                        }}>
                                            {t('common.noData')}
                                        </Typography>
                                    )}
                                </Box>
                            </Grid>
                            );
                        })}
                    </Grid>
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
                            bgcolor: 'rgba(255, 255, 255, 0.9)',
                            backdropFilter: 'blur(20px)',
                            borderRadius: { xs: '20px 20px 0 0', sm: '24px 24px 0 0' },
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
                        <Box sx={{ px: { xs: 2, sm: 3 }, pb: 2, flexShrink: 0 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6" sx={{ fontSize: { xs: '18px', sm: '20px' }, fontWeight: 700, color: '#101c22' }}>
                                    {editingActivity ? t('activities.editTitle') : getActivityTitle(formData.type)}
                                </Typography>
                                {!editingActivity && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#6b7f8a', fontSize: { xs: '12px', sm: '13px' }, display: { xs: 'none', sm: 'block' } }}>
                                            {t('activities.bulk.label')}
                                        </Typography>
                                        <MuiButton
                                            size="small"
                                            variant={isBulkMode ? "contained" : "outlined"}
                                            onClick={() => {
                                                setIsBulkMode(!isBulkMode);
                                                if (!isBulkMode) {
                                                    setBulkTimes([formData.time]);
                                                }
                                            }}
                                            sx={{ 
                                                minWidth: 'auto', 
                                                px: 1.5,
                                                py: 0.5,
                                                fontSize: '12px',
                                                bgcolor: isBulkMode ? '#13a4ec' : 'transparent',
                                                color: isBulkMode ? '#ffffff' : '#6b7f8a',
                                                borderColor: '#e5e7eb',
                                                '&:hover': {
                                                    bgcolor: isBulkMode ? '#0e8fd4' : '#f6f7f8',
                                                    borderColor: '#e5e7eb'
                                                }
                                            }}
                                        >
                                            {isBulkMode ? t('common.on') : t('common.off')}
                                        </MuiButton>
                                    </Box>
                                )}
                            </Box>
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
                                                bgcolor: '#e3e8eb',
                                                borderRadius: '12px',
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
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#6b7f8a' }}>
                                            {t('activities.form.time')}
                                        </Typography>
                                        <input
                                            type="time"
                                            value={formData.time}
                                            onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '12px 16px',
                                                fontSize: '16px',
                                                border: 'none',
                                                borderRadius: '12px',
                                                backgroundColor: '#e3e8eb',
                                                color: '#101c22',
                                                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                                                boxSizing: 'border-box'
                                            }}
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
                                                    sx={{ 
                                                        flex: 1,
                                                        '& .MuiOutlinedInput-root': {
                                                            bgcolor: '#e3e8eb',
                                                            borderRadius: '12px',
                                                            '& fieldset': {
                                                                border: 'none'
                                                            },
                                                            '&:hover fieldset': {
                                                                border: 'none'
                                                            },
                                                            '&.Mui-focused fieldset': {
                                                                border: '2px solid #13a4ec'
                                                            }
                                                        }
                                                    }}
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

                                {/* Diaper Checkboxes */}
                                {formData.type === 'diaper' && (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                        <FormControlLabel
                                            control={
                                                <Checkbox 
                                                    checked={!!formData.isUrine} 
                                                    onChange={(e) => setFormData({ ...formData, isUrine: e.target.checked })}
                                                    sx={{
                                                        color: '#13a4ec',
                                                        '&.Mui-checked': {
                                                            color: '#13a4ec'
                                                        }
                                                    }}
                                                />
                                            }
                                            label={<Typography sx={{ fontSize: '14px', color: '#101c22' }}>{t('diaper.urine')}</Typography>}
                                        />
                                        <FormControlLabel
                                            control={
                                                <Checkbox 
                                                    checked={!!formData.isStool} 
                                                    onChange={(e) => setFormData({ ...formData, isStool: e.target.checked })}
                                                    sx={{
                                                        color: '#13a4ec',
                                                        '&.Mui-checked': {
                                                            color: '#13a4ec'
                                                        }
                                                    }}
                                                />
                                            }
                                            label={<Typography sx={{ fontSize: '14px', color: '#101c22' }}>{t('diaper.stool')}</Typography>}
                                        />

                                        {formData.isStool && (
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pl: 4 }}>
                                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                    {(['vàng', 'nâu', 'xám'] as const).map((color) => (
                                                        <FormControlLabel
                                                            key={color}
                                                            control={
                                                                <Checkbox
                                                                    checked={Array.isArray(formData.stoolColor) ? formData.stoolColor.includes(color) : false}
                                                                    onChange={(e) => {
                                                                        const prev = Array.isArray(formData.stoolColor) ? formData.stoolColor : [];
                                                                        if (e.target.checked) {
                                                                            setFormData({ ...formData, stoolColor: Array.from(new Set([...prev, color])) });
                                                                        } else {
                                                                            setFormData({ ...formData, stoolColor: prev.filter((c) => c !== color) });
                                                                        }
                                                                    }}
                                                                    sx={{
                                                                        color: '#13a4ec',
                                                                        '&.Mui-checked': {
                                                                            color: '#13a4ec'
                                                                        }
                                                                    }}
                                                                />
                                                            }
                                                            label={<Typography sx={{ fontSize: '13px', color: '#101c22' }}>{t(`diaper.color.${color === 'vàng' ? 'yellow' : color === 'nâu' ? 'brown' : 'gray'}`)}</Typography>}
                                                        />
                                                    ))}
                                                </Box>
                                                <FormControl fullWidth>
                                                    <InputLabel id="stool-consistency-label" sx={{ color: '#6b7f8a' }}>{t('diaper.consistency.label')}</InputLabel>
                                                    <Select
                                                        labelId="stool-consistency-label"
                                                        value={formData.stoolConsistency || 'bình thường'}
                                                        label={t('diaper.consistency.label')}
                                                        onChange={(e) => setFormData({ ...formData, stoolConsistency: e.target.value as 'lỏng' | 'bình thường' | 'khô' })}
                                                        sx={{
                                                            bgcolor: '#e3e8eb',
                                                            borderRadius: '12px',
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
                                                        <MenuItem value="lỏng">{t('diaper.consistency.loose')}</MenuItem>
                                                        <MenuItem value="bình thường">{t('diaper.consistency.normal')}</MenuItem>
                                                        <MenuItem value="khô">{t('diaper.consistency.hard')}</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            </Box>
                                        )}
                                    </Box>
                                )}

                                {/* Feeding Type Tabs */}
                                {formData.type === 'feeding' && (
                                    <Box sx={{ width: '100%', mb: 2 }}>
                                        <Tabs
                                            value={formData.foodType === 'solid' ? 1 : 0}
                                            onChange={(_, newValue) => setFormData({ ...formData, foodType: newValue === 0 ? 'milk' : 'solid' })}
                                            variant="fullWidth"
                                            sx={{
                                                mb: 2,
                                                '& .MuiTab-root': {
                                                    textTransform: 'none',
                                                    fontWeight: 600,
                                                    fontSize: '15px'
                                                }
                                            }}
                                        >
                                            <Tab label={t('feeding.milk')} />
                                            <Tab label={t('feeding.solid')} />
                                        </Tabs>

                                        {formData.foodType !== 'solid' ? (
                                            <TextField
                                                label={t('feeding.amountMl')}
                                                type="number"
                                                inputMode="decimal"
                                                inputProps={{ inputMode: 'decimal', pattern: '[0-9]*' }}
                                                value={formData.amount}
                                                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                                fullWidth
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: '#e3e8eb',
                                                        borderRadius: '12px',
                                                        '& fieldset': { border: 'none' },
                                                        '&:hover fieldset': { border: 'none' },
                                                        '&.Mui-focused fieldset': { border: '2px solid #13a4ec' }
                                                    },
                                                    '& .MuiInputLabel-root': {
                                                        color: '#6b7f8a',
                                                        backgroundColor: '#e3e8eb',
                                                        paddingRight: '4px',
                                                        '&.MuiInputLabel-shrink': {
                                                            backgroundColor: '#ffffff',
                                                            paddingLeft: '4px',
                                                            paddingRight: '4px'
                                                        }
                                                    }
                                                }}
                                            />
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
                                                                            color: selected ? '#ffffff' : '#101c22',
                                                                            bgcolor: selected ? '#13a4ec' : '#e3e8eb',
                                                                            '&:hover': { bgcolor: selected ? '#13a4ec' : '#d5dce0' }
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
                                                            sx={{
                                                                '& .MuiOutlinedInput-root': {
                                                                    bgcolor: '#e3e8eb',
                                                                    borderRadius: '12px',
                                                                    '& fieldset': { border: 'none' },
                                                                    '&:hover fieldset': { border: 'none' },
                                                                    '&.Mui-focused fieldset': { border: '2px solid #13a4ec' }
                                                                },
                                                                '& .MuiInputLabel-root': {
                                                                    color: '#6b7f8a',
                                                                    backgroundColor: '#e3e8eb',
                                                                    paddingRight: '4px',
                                                                    '&.MuiInputLabel-shrink': {
                                                                        backgroundColor: '#ffffff',
                                                                        paddingLeft: '4px',
                                                                        paddingRight: '4px'
                                                                    }
                                                                }
                                                            }}
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
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            bgcolor: '#e3e8eb',
                                                            borderRadius: '12px',
                                                            '& fieldset': { border: 'none' },
                                                            '&:hover fieldset': { border: 'none' },
                                                            '&.Mui-focused fieldset': { border: '2px solid #13a4ec' }
                                                        },
                                                        '& .MuiInputLabel-root': {
                                                            color: '#6b7f8a',
                                                            backgroundColor: '#e3e8eb',
                                                            paddingRight: '4px',
                                                            '&.MuiInputLabel-shrink': {
                                                                backgroundColor: '#ffffff',
                                                                paddingLeft: '4px',
                                                                paddingRight: '4px'
                                                            }
                                                        }
                                                    }}
                                                />
                                                <FormControl fullWidth>
                                                    <InputLabel id="food-preference-label">{t('feeding.reaction.label')}</InputLabel>
                                                    <Select
                                                        labelId="food-preference-label"
                                                        id="food-preference-select"
                                                        value={formData.foodPreference ?? 'normal'}
                                                        label={t('feeding.reaction.label')}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, foodPreference: (e.target.value as 'enthusiastic' | 'normal' | 'dislike' | 'allergic') || 'normal' }))}
                                                        sx={{
                                                            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                                                            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { border: '2px solid #13a4ec' },
                                                            bgcolor: '#e3e8eb',
                                                            borderRadius: '12px'
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
                                                        <MenuItem value="enthusiastic" sx={{ color: '#101c22' }}>{t('feeding.reaction.enthusiastic')}</MenuItem>
                                                        <MenuItem value="normal" sx={{ color: '#101c22' }}>{t('feeding.reaction.normal')}</MenuItem>
                                                        <MenuItem value="dislike" sx={{ color: '#101c22' }}>{t('feeding.reaction.dislike')}</MenuItem>
                                                        <MenuItem value="allergic" sx={{ color: '#d32f2f' }}>{t('feeding.reaction.allergic')}</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            </Box>
                                        )}
                                    </Box>
                                )}

                                {/* Sleep Duration and Time Fields */}
                                {formData.type === 'sleep' && (
                                    <>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                            <Box sx={{ flex: 1 }}>
                                                <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#6b7f8a', mb: 0.5 }}>
                                                    {t('sleep.startTime')}
                                                </Typography>
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
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            bgcolor: '#e3e8eb',
                                                            borderRadius: '12px',
                                                            '& fieldset': { border: 'none' },
                                                            '&:hover fieldset': { border: 'none' },
                                                            '&.Mui-focused fieldset': { border: '2px solid #13a4ec' }
                                                        }
                                                    }}
                                                />
                                            </Box>
                                            <Box sx={{ flex: 1 }}>
                                                <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#6b7f8a', mb: 0.5 }}>
                                                    {t('sleep.endTimeWake')}
                                                </Typography>
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
                                                    sx={{
                                                        '& .MuiOutlinedInput-root': {
                                                            bgcolor: '#e3e8eb',
                                                            borderRadius: '12px',
                                                            '& fieldset': { border: 'none' },
                                                            '&:hover fieldset': { border: 'none' },
                                                            '&.Mui-focused fieldset': { border: '2px solid #13a4ec' }
                                                        }
                                                    }}
                                                />
                                            </Box>
                                        </Box>
                                        <TextField
                                            label={t('sleep.durationMinutes')}
                                            type="number"
                                            value={formData.duration}
                                            disabled={true}
                                            fullWidth
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    bgcolor: '#f0f2f5',
                                                    borderRadius: '12px',
                                                    '& fieldset': {
                                                        border: 'none'
                                                    },
                                                    '&:hover fieldset': {
                                                        border: 'none'
                                                    },
                                                    '&.Mui-focused fieldset': {
                                                        border: 'none'
                                                    }
                                                },
                                                '& .MuiInputLabel-root': {
                                                    color: '#6b7f8a',
                                                    backgroundColor: '#f0f2f5',
                                                    paddingRight: '4px',
                                                    '&.MuiInputLabel-shrink': {
                                                        backgroundColor: '#ffffff',
                                                        paddingLeft: '4px',
                                                        paddingRight: '4px'
                                                    }
                                                }
                                            }}
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
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: '#e3e8eb',
                                                        borderRadius: '12px',
                                                        '& fieldset': {
                                                            border: 'none'
                                                        },
                                                        '&:hover fieldset': {
                                                            border: 'none'
                                                        },
                                                        '&.Mui-focused fieldset': {
                                                            border: '2px solid #13a4ec'
                                                        }
                                                    },
                                                    '& .MuiInputLabel-root': {
                                                        color: '#6b7f8a',
                                                        backgroundColor: '#e3e8eb',
                                                        paddingRight: '4px',
                                                        '&.MuiInputLabel-shrink': {
                                                            backgroundColor: '#ffffff',
                                                            paddingLeft: '4px',
                                                            paddingRight: '4px'
                                                        }
                                                    }
                                                }}
                                            />
                                            <TextField
                                                label={t('measurement.heightCm')}
                                                type="number"
                                                value={formData.height}
                                                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                                fullWidth
                                                sx={{
                                                    '& .MuiOutlinedInput-root': {
                                                        bgcolor: '#e3e8eb',
                                                        borderRadius: '12px',
                                                        '& fieldset': {
                                                            border: 'none'
                                                        },
                                                        '&:hover fieldset': {
                                                            border: 'none'
                                                        },
                                                        '&.Mui-focused fieldset': {
                                                            border: '2px solid #13a4ec'
                                                        }
                                                    },
                                                    '& .MuiInputLabel-root': {
                                                        color: '#6b7f8a',
                                                        backgroundColor: '#e3e8eb',
                                                        paddingRight: '4px',
                                                        '&.MuiInputLabel-shrink': {
                                                            backgroundColor: '#ffffff',
                                                            paddingLeft: '4px',
                                                            paddingRight: '4px'
                                                        }
                                                    }
                                                }}
                                            />
                                        </Box>
                                        <TextField
                                            label={t('measurement.temperatureC')}
                                            type="number"
                                            value={formData.temperature}
                                            onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                                            fullWidth
                                            sx={{
                                                '& .MuiOutlinedInput-root': {
                                                    bgcolor: '#e3e8eb',
                                                    borderRadius: '12px',
                                                    '& fieldset': {
                                                        border: 'none'
                                                    },
                                                    '&:hover fieldset': {
                                                        border: 'none'
                                                    },
                                                    '&.Mui-focused fieldset': {
                                                        border: '2px solid #13a4ec'
                                                    }
                                                },
                                                '& .MuiInputLabel-root': {
                                                    color: '#6b7f8a',
                                                    backgroundColor: '#e3e8eb',
                                                    paddingRight: '4px',
                                                    '&.MuiInputLabel-shrink': {
                                                        backgroundColor: '#ffffff',
                                                        paddingLeft: '4px',
                                                        paddingRight: '4px'
                                                    }
                                                }
                                            }}
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
                                        sx={{
                                            '& .MuiOutlinedInput-root': {
                                                bgcolor: '#e3e8eb',
                                                borderRadius: '12px',
                                                '& fieldset': {
                                                    border: 'none'
                                                },
                                                '&:hover fieldset': {
                                                },
                                                '&.Mui-focused fieldset': {
                                                    border: '2px solid #13a4ec'
                                                }
                                            },
                                            '& .MuiInputLabel-root': {
                                                color: '#6b7f8a',
                                                backgroundColor: '#e3e8eb',
                                                paddingRight: '4px',
                                                '&.MuiInputLabel-shrink': {
                                                    backgroundColor: '#ffffff',
                                                    paddingLeft: '4px',
                                                    paddingRight: '4px'
                                                }
                                            }
                                        }}
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
                            borderTop: '1px solid rgba(0, 0, 0, 0.05)',
                            bgcolor: 'rgba(255, 255, 255, 0.8)',
                            backdropFilter: 'blur(10px)',
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
                                    variant="outlined"
                                    fullWidth
                                    sx={{
                                        borderRadius: '12px',
                                        height: { xs: 44, sm: 48 },
                                        borderColor: '#e5e7eb',
                                        color: '#6b7f8a',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        fontSize: { xs: '14px', sm: '16px' },
                                        '&:hover': {
                                            borderColor: '#6b7f8a',
                                            bgcolor: 'transparent'
                                        }
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
                                        borderRadius: '12px',
                                        height: { xs: 44, sm: 48 },
                                        bgcolor: '#13a4ec',
                                        boxShadow: 'none',
                                        textTransform: 'none',
                                        fontWeight: 700,
                                        fontSize: { xs: '14px', sm: '16px' },
                                        '&:hover': {
                                            bgcolor: '#0e8fd4',
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
