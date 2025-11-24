import React, { useState, useEffect, useMemo, Component, ReactNode } from 'react';
import { Box, Typography, Button as MuiButton, TextField, MenuItem, Select, InputLabel, FormControl, IconButton, Card, CardContent, Grid, Snackbar, Alert, Checkbox, FormControlLabel } from '@mui/material';

import { calculateStatsForDate } from '../utils/dailyStats';
import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { getCurrentUser } from '../firebase/auth';
import { generateDailySummary, analyzeActivities, DailySummary, AnalyzeResult } from '../services/aiService';

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
                    <Typography variant="h6" color="error">Có lỗi xảy ra</Typography>
                    <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>Chi tiết: {this.state.errorMessage}</Typography>
                    <MuiButton onClick={() => this.setState({ hasError: false, errorMessage: '' })} variant="contained">
                        Thử lại
                    </MuiButton>
                </Box>
            );
        }
        return this.props.children;
    }
}

const ActivitiesPage: React.FC = () => {
    const { baby } = useBaby();
    const { selectedDate, setSelectedDate } = useDateContext();
    const [activities, setActivities] = useState<Activity[]>();
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [currentUser, setCurrentUser] = useState<any>(null);
    
    // Sleep timer state
    const [ongoingSleep, setOngoingSleep] = useState<{ startTime: Date } | null>(null);
    const [sleepElapsedTime, setSleepElapsedTime] = useState<number>(0); // in seconds

    // Daily rating state
    const [dailyRating, setDailyRating] = useState<number>(0); // 0 = not rated, 1-5 = star rating
    const [dailyRatingNotes, setDailyRatingNotes] = useState<string>('');
    const [hoveredStar, setHoveredStar] = useState<number>(0);
    const [monthRatings, setMonthRatings] = useState<Map<string, number>>(new Map()); // Map of date string to rating
    
    // Real-time update state for time since last activity
    const [currentTime, setCurrentTime] = useState(new Date());

    // Update current time every 5 minutes for real-time display
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(new Date());
        }, 300000); // Update every 5 minutes
        
        return () => clearInterval(interval);
    }, []);

    // Get current user when component mounts
    useEffect(() => {
        const user = getCurrentUser();
        setCurrentUser(user);
    }, []);
    const [formData, setFormData] = useState<{
        type: 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo';
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
        timestamp: undefined
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

    // Load activities from Firebase when user is available
    useEffect(() => {
        const loadActivities = async () => {
            if (currentUser?.uid) {
                try {
                    setLoading(true);
                    const userActivities = await firestore.getActivities(currentUser.uid);
                    // Convert Firebase activities to local format and normalize types
                    const convertedActivities = userActivities.map((activity: any) => {
                        // Normalize activity types to handle legacy data
                        let normalizedType = activity.type;
                        if (activity.type === 'diaperChange') {
                            normalizedType = 'diaper';
                        } else if (activity.type === 'Sữa' || activity.type === 'Bú sữa') {
                            // legacy Vietnamese value -> feeding
                            normalizedType = 'feeding';
                        } else if (activity.type === 'Ngủ') {
                            normalizedType = 'sleep';
                        } else if (activity.type === 'Thay tã') {
                            normalizedType = 'diaper';
                        } else if (activity.type === 'Đo lường') {
                            normalizedType = 'measurement';
                        } else if (activity.type === 'Ghi chú') {
                            normalizedType = 'memo';
                        }
                        
                        // Normalize details structure for feeding activities
                        let normalizedDetails = activity.details ? { ...activity.details } : {};
                        if (normalizedType === 'feeding' && activity.details) {
                            // Keep existing amount if it exists and is valid
                            if (!normalizedDetails.amount && activity.details.time && typeof activity.details.time === 'number') {
                                // Only use time as amount if no amount exists and time looks like a number (old format)
                                normalizedDetails.amount = activity.details.time;
                            }
                        }
                        
                        return {
                            id: activity.id,
                            type: normalizedType,
                            timestamp: activity.timestamp,
                            details: normalizedDetails
                        };
                    });
                    setActivities(convertedActivities);
                } catch (error) {
                    // Error loading activities - silently fail in production
                } finally {
                    setLoading(false);
                }
            }
        };

        loadActivities();
    }, [currentUser]);    

    // Load ongoing sleep session when component mounts
    useEffect(() => {
        const loadOngoingSleep = async () => {
            if (currentUser?.uid && baby?.id) {
                try {
                    const sleep = await firestore.getOngoingSleep(currentUser.uid, baby.id);
                    setOngoingSleep(sleep);
                } catch (error) {
                    // Error loading ongoing sleep - silently fail in production
                }
            }
        };

        loadOngoingSleep();
    }, [currentUser, baby]);

    // Update sleep elapsed time every 5 minutes when there's an ongoing sleep
    useEffect(() => {
        if (!ongoingSleep) {
            setSleepElapsedTime(0);
            return;
        }

        const updateElapsedTime = () => {
            const now = new Date();
            const elapsed = Math.floor((now.getTime() - ongoingSleep.startTime.getTime()) / 1000);
            setSleepElapsedTime(elapsed);
        };

        // Update immediately
        updateElapsedTime();

        // Then update every 5 minutes (300000ms) instead of every second
        const interval = setInterval(updateElapsedTime, 300000);

        return () => clearInterval(interval);
    }, [ongoingSleep]);

    // Load daily rating when selectedDate changes
    useEffect(() => {
        const loadDailyRating = async () => {
            if (currentUser?.uid && baby?.id && selectedDate) {
                try {
                    const rating = await firestore.getDailyRating(currentUser.uid, baby.id, selectedDate);
                    if (rating) {
                        setDailyRating(rating.rating);
                        setDailyRatingNotes(rating.notes || '');
                    } else {
                        setDailyRating(0);
                        setDailyRatingNotes('');
                    }
                } catch (error) {
                    // Error loading daily rating - silently fail in production
                }
            }
        };

        loadDailyRating();
    }, [currentUser, baby, selectedDate]);

    // Load ratings for the current month (for calendar display)
    useEffect(() => {
        const loadMonthRatings = async () => {
            if (currentUser?.uid && selectedDate) {
                try {
                    const year = selectedDate.getFullYear();
                    const month = selectedDate.getMonth();
                    const startDate = new Date(year, month, 1);
                    const endDate = new Date(year, month + 1, 0);
                    
                    const ratings = await firestore.getDailyRatingsForRange(currentUser.uid, startDate, endDate);
                    setMonthRatings(ratings);
                } catch (error) {
                    // Error loading month ratings - silently fail in production
                }
            }
        };

        loadMonthRatings();
    }, [currentUser, selectedDate]);

    // Handle start sleep
    const handleStartSleep = async () => {
        if (!currentUser?.uid || !baby?.id) {
            setSnackbar({
                open: true,
                message: 'Vui lòng đăng nhập và có thông tin bé trước!',
                severity: 'warning'
            });
            return;
        }

        const startTime = new Date();
        const success = await firestore.startOngoingSleep(currentUser.uid, baby.id, startTime);
        
        if (success) {
            setOngoingSleep({ startTime });
            setSnackbar({
                open: true,
                message: 'Đã bắt đầu đếm giấc ngủ! ⏱️',
                severity: 'success'
            });
        } else {
            setSnackbar({
                open: true,
                message: 'Có lỗi khi bắt đầu đếm giờ ngủ!',
                severity: 'error'
            });
        }
    };

    // Handle stop sleep
    const handleStopSleep = async () => {
        if (!currentUser?.uid || !baby?.id) return;

        try {
            setLoading(true);
            const sleepData = await firestore.stopOngoingSleep(currentUser.uid, baby.id);
            
            if (sleepData) {
                // Create a sleep activity with the calculated duration
                const activityData = {
                    babyId: baby.id,
                    type: 'sleep' as const,
                    timestamp: sleepData.endTime,
                    details: {
                        time: sleepData.endTime,
                        duration: sleepData.duration,
                        notes: `Bắt đầu: ${sleepData.startTime.toLocaleTimeString('vi-VN')}`
                    }
                };

                const savedActivity = await firestore.saveActivity(currentUser.uid, activityData);
                const localActivity = {
                    id: savedActivity.id,
                    type: 'sleep' as const,
                    timestamp: savedActivity.timestamp,
                    details: savedActivity.details
                };

                setActivities([localActivity, ...(activities || [])]);
                setOngoingSleep(null);
                setSnackbar({
                    open: true,
                    message: `Đã ghi lại giấc ngủ: ${sleepData.duration} phút! 😴`,
                    severity: 'success'
                });
            }
        } catch (error) {
            console.error('Error stopping sleep:', error);
            setSnackbar({
                open: true,
                message: 'Có lỗi khi dừng đếm giờ ngủ!',
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    // Handle save daily rating
    const handleSaveDailyRating = async (rating: number) => {
        if (!currentUser?.uid || !baby?.id) return;

        try {
            const success = await firestore.saveDailyRating(
                currentUser.uid,
                baby.id,
                selectedDate,
                rating,
                dailyRatingNotes
            );

            if (success) {
                setDailyRating(rating);
                const label = rating === 5 ? 'Tuyệt vời' : rating === 4 ? 'Tốt' : rating === 3 ? 'Bình thường' : rating === 2 ? 'Khó khăn' : 'Vất vả';
                setSnackbar({
                    open: true,
                    message: `Đã đánh giá: ${label}`,
                    severity: 'success'
                });
            }
        } catch (error) {
            setSnackbar({
                open: true,
                message: 'Có lỗi khi lưu đánh giá!',
                severity: 'error'
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!currentUser?.uid || !baby?.id) {
            setSnackbar({
                open: true,
                message: 'Vui lòng đăng nhập và có thông tin bé trước khi thêm hoạt động!',
                severity: 'warning'
            });
            return;
        }
        
        try {
            setLoading(true);
            
            // Create timestamp using selected date and form time
            // If formData.timestamp exists (from sleep end time edit), use that
            let timestamp: Date;
            if (formData.timestamp) {
                timestamp = new Date(formData.timestamp);
            } else {
                const [hours, minutes] = formData.time.split(':').map(Number);
                timestamp = new Date(selectedDate);
                timestamp.setHours(hours, minutes, 0, 0);
            }
            
            // Create activity details based on type
            let details: any = {};
            switch (formData.type) {
                case 'feeding':
                    details = {
                        time: timestamp,
                        amount: formData.amount ? Number(formData.amount) : 0,
                        notes: formData.notes || ''
                    };
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
                type: formData.type as 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo',
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
                    message: 'Hoạt động đã được cập nhật!',
                    severity: 'success'
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
                            message: 'Vui lòng nhập ít nhất một thời gian!',
                            severity: 'warning'
                        });
                        return;
                    }

                    // Check for duplicate times
                    const uniqueTimes = Array.from(new Set(validTimes));
                    if (uniqueTimes.length !== validTimes.length) {
                        setSnackbar({
                            open: true,
                            message: 'Có thời gian bị trùng lặp! Vui lòng kiểm tra lại.',
                            severity: 'warning'
                        });
                        return;
                    }

                    // Validate time format
                    const invalidTimes = validTimes.filter(time => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time));
                    if (invalidTimes.length > 0) {
                        setSnackbar({
                            open: true,
                            message: `Thời gian không hợp lệ: ${invalidTimes.join(', ')}`,
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
                                errors: [...prev.errors, `Lỗi tại ${time}: ${error instanceof Error ? error.message : 'Unknown error'}`]
                            }));
                        }
                    }

                    // Add all new activities to the list
                    setActivities([...newActivities, ...(activities || [])]);
                    
                    const successCount = newActivities.length;
                    const errorCount = validTimes.length - successCount;
                    
                    if (errorCount === 0) {
                        setSnackbar({
                            open: true,
                            message: `Đã tạo thành công ${successCount} hoạt động!`,
                            severity: 'success'
                        });
                    } else {
                        setSnackbar({
                            open: true,
                            message: `Tạo thành công ${successCount}/${validTimes.length} hoạt động. ${errorCount} lỗi.`,
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
                        message: 'Hoạt động đã được lưu!',
                        severity: 'success'
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
            stoolColor: ['vàng'],
                stoolConsistency: 'bình thường',
                timestamp: undefined
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
                message: 'Có lỗi khi lưu hoạt động. Vui lòng thử lại!',
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };    const getActivityIcon = (type: string) => {
        switch (type) {
            case 'feeding': 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M245.66,42.34l-32-32a8,8,0,0,0-11.32,11.32l1.48,1.47L148.65,64.51l-38.22,7.65a8.05,8.05,0,0,0-4.09,2.18L23,157.66a24,24,0,0,0,0,33.94L64.4,233a24,24,0,0,0,33.94,0l83.32-83.31a8,8,0,0,0,2.18-4.09l7.65-38.22,41.38-55.17,1.47,1.48a8,8,0,0,0,11.32-11.32ZM96,107.31,148.69,160,104,204.69,51.31,152ZM81.37,224a7.94,7.94,0,0,1-5.65-2.34L34.34,180.28a8,8,0,0,1,0-11.31L40,163.31,92.69,216,87,221.66A8,8,0,0,1,81.37,224ZM177.6,99.2a7.92,7.92,0,0,0-1.44,3.23l-7.53,37.63L160,148.69,107.31,96l8.63-8.63,37.63-7.53a7.92,7.92,0,0,0,3.23-1.44l58.45-43.84,6.19,6.19Z"></path>
                    </svg>
                );
            case 'sleep': 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z"></path>
                    </svg>
                );
            case 'diaper': 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M92,140a12,12,0,1,1,12-12A12,12,0,0,1,92,140Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,116Zm-12.27,45.23a45,45,0,0,1-47.46,0,8,8,0,0,0-8.54,13.54,61,61,0,0,0,64.54,0,8,8,0,0,0-8.54-13.54ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.11,88.11,0,0,0-84.09-87.91C120.32,56.38,120,71.88,120,72a8,8,0,0,0,16,0,8,8,0,0,1,16,0,24,24,0,0,1-48,0c0-.73.13-14.3,8.46-30.63A88,88,0,1,0,216,128Z"></path>
                    </svg>
                );
            case 'measurement': 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M235.32,73.37,182.63,20.69a16,16,0,0,0-22.63,0L20.68,160a16,16,0,0,0,0,22.63l52.69,52.68a16,16,0,0,0,22.63,0L235.32,96A16,16,0,0,0,235.32,73.37ZM84.68,224,32,171.31l32-32,26.34,26.35a8,8,0,0,0,11.32-11.32L75.31,128,96,107.31l26.34,26.35a8,8,0,0,0,11.32-11.32L107.31,96,128,75.31l26.34,26.35a8,8,0,0,0,11.32-11.32L139.31,64l32-32L224,84.69Z"></path>
                    </svg>
                );
            case 'bath': 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M64,236a12,12,0,1,1-12-12A12,12,0,0,1,64,236Zm20-44a12,12,0,1,0,12,12A12,12,0,0,0,84,192Zm-64,0a12,12,0,1,0,12,12A12,12,0,0,0,20,192Zm32-32a12,12,0,1,0,12,12A12,12,0,0,0,52,160ZM256,40a8,8,0,0,1-8,8H219.31L191.46,75.86,169.8,202.65a16,16,0,0,1-27.09,8.66l-98-98a16,16,0,0,1,8.69-27.1L180.14,64.54,208,36.69A15.86,15.86,0,0,1,219.31,32H248A8,8,0,0,1,256,40ZM174.21,81.79,56,102l98,98Z"></path>
                    </svg>
                );
            case 'memo': 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M88,96a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H96A8,8,0,0,1,88,96Zm8,40h64a8,8,0,0,0,0-16H96a8,8,0,0,0,0,16Zm32,16H96a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM224,48V156.69A15.86,15.86,0,0,1,219.31,168L168,219.31A15.86,15.86,0,0,1,156.69,224H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM48,208H152V160a8,8,0,0,1,8-8h48V48H48Zm120-40v28.7L196.69,168Z"></path>
                    </svg>
                );
            default: 
                return (
                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                        <path d="M88,96a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H96A8,8,0,0,1,88,96Zm8,40h64a8,8,0,0,0,0-16H96a8,8,0,0,0,0,16Zm32,16H96a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM224,48V156.69A15.86,15.86,0,0,1,219.31,168L168,219.31A15.86,15.86,0,0,1,156.69,224H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM48,208H152V160a8,8,0,0,1,8-8h48V48H48Zm120-40v28.7L196.69,168Z"></path>
                    </svg>
                );
        }
    };

    const getActivityLabel = (type: string) => {
        switch (type) {
            case 'feeding': return 'Feeding';
            case 'sleep': return 'Sleep';
            case 'diaper': return 'Diaper change';
            case 'measurement': return 'Measurement';
            case 'bath': return 'Bath';
            case 'memo': return 'Memo';
            default: return 'Other';
        }
    };

    const getActivityTitle = (type: string) => {
        switch (type) {
            case 'feeding': return 'Add Milk';
            case 'sleep': return 'Add Sleep';
            case 'diaper': return 'Add Diaper';
            case 'measurement': return 'Add Measurement';
            case 'bath': return 'Add Bath';
            case 'memo': return 'Add Memo';
            default: return 'Add activity';
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

    // Calculate daily statistics safely with useMemo and error handling
    const todayStats = useMemo(() => {
        const defaultStats = {
            feeding: { count: 0, totalAmount: 0 },
            urine: { count: 0 },
            stool: { count: 0 },
            sleep: { count: 0, totalDuration: 0 }
        };

        try {
            // Ensure activities and selectedDate are valid before calculating
            if (!activities || !selectedDate) {
                return defaultStats;
            }
            return calculateStatsForDate(activities, selectedDate);
        } catch (err) {
            // Return default stats to prevent the UI from crashing
            return defaultStats;
        }
    }, [activities, selectedDate]);

    // Compute yesterday's stats for a brief summary line
    const yesterdayStats = useMemo(() => {
        try {
            const y = new Date(selectedDate);
            y.setDate(y.getDate() - 1);
            y.setHours(0, 0, 0, 0);
            return calculateStatsForDate(activities || [], y);
        } catch (err) {
            return {
                feeding: { count: 0, totalAmount: 0 },
                urine: { count: 0 },
                stool: { count: 0 },
                sleep: { count: 0, totalDuration: 0 }
            } as any;
        }
    }, [activities, selectedDate]);

    // Handle delete activity
    const handleDeleteActivity = async (activityId: string) => {
        if (!currentUser?.uid) return;
        
        // Confirm before deleting
        if (!window.confirm('Bạn có chắc chắn muốn xóa hoạt động này?')) {
            return;
        }
        
        try {
            setLoading(true);
            const success = await firestore.deleteActivity(currentUser.uid, activityId);
            if (success) {
                setActivities(activities?.filter(activity => activity.id !== activityId) || []);
                setSnackbar({
                    open: true,
                    message: 'Hoạt động đã được xóa!',
                    severity: 'success'
                });
            } else {
                setSnackbar({
                    open: true,
                    message: 'Có lỗi khi xóa hoạt động!',
                    severity: 'error'
                });
            }
        } catch (error) {
            setSnackbar({
                open: true,
                message: 'Có lỗi khi xóa hoạt động!',
                severity: 'error'
            });
        } finally {
            setLoading(false);
        }
    };

    // Handle edit activity
    const handleEditActivity = (activity: Activity) => {
        // Convert activity data back to form format
        const activityTime = new Date(activity.timestamp);
        
        setFormData({
            type: activity.type as any,
            time: activityTime.toTimeString().slice(0, 5),
            amount: activity.details?.amount?.toString() || '',
            duration: activity.details?.duration?.toString() || '',
            notes: activity.details?.notes || '',
            weight: activity.details?.weight?.toString() || '',
            height: activity.details?.height?.toString() || '',
            temperature: activity.details?.temperature?.toString() || '',
            isUrine: activity.details?.isUrine ?? true,
            isStool: activity.details?.isStool ?? false
            ,
            stoolColor: Array.isArray(activity.details?.stoolColor)
                ? activity.details.stoolColor
                : activity.details?.stoolColor
                    ? [activity.details.stoolColor]
                    : [],
            stoolConsistency: activity.details?.stoolConsistency || 'bình thường',
            timestamp: activity.timestamp.toISOString() // Store original timestamp for editing
        });
        
        setEditingActivity(activity);
        setHideActivityType(true);
        setShowForm(true);
    };

    const [isCalendarExpanded, setIsCalendarExpanded] = useState(false);

    return (
        <ErrorBoundary>
        <Box sx={{
            minHeight: '100vh',
            p: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            <Box sx={{ px: { xs: 2, sm: 3 }, pt: 3, pb: 2 }}>
                {/* Calendar Card - Simplified Date Picker */}
                <Card sx={{ 
                    mb: 3, 
                    mx: 0,
                    borderRadius: '16px', 
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb'
                }}>
                    <CardContent sx={{ p: '12px 16px', '&:last-child': { pb: '12px' } }}>
                        {!isCalendarExpanded ? (
                            // Simple Date Picker Button
                            <Box 
                                onClick={() => setIsCalendarExpanded(true)}
                                sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    p: 1,
                                    borderRadius: '12px',
                                    '&:hover': { bgcolor: '#f6f7f8' }
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Zm-96-88a12,12,0,1,1-12-12A12,12,0,0,1,112,120Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,156,120Zm-88,40a12,12,0,1,1-12-12A12,12,0,0,1,68,160Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,112,160Zm44,0a12,12,0,1,1-12-12A12,12,0,0,1,156,160Z"></path>
                                    </svg>
                                    <Box>
                                        <Typography sx={{ fontSize: '14px', color: '#6b7f8a', fontWeight: 500 }}>
                                            Quick date select
                                        </Typography>
                                        <Typography sx={{ fontSize: '16px', color: '#101c22', fontWeight: 700, mt: 0.5 }}>
                                            {selectedDate.toLocaleDateString('en-US', { 
                                                weekday: 'short', 
                                                year: 'numeric', 
                                                month: 'short', 
                                                day: 'numeric' 
                                            })}
                                        </Typography>
                                    </Box>
                                </Box>
                                <svg width="20" height="20" viewBox="0 0 256 256" fill="#6b7f8a">
                                    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z"></path>
                                </svg>
                            </Box>
                        ) : (
                            <>
                        {/* Month/Year Navigation */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <IconButton 
                                size="small"
                                onClick={() => {
                                    const newDate = new Date(selectedDate);
                                    newDate.setMonth(newDate.getMonth() - 1);
                                    setSelectedDate(newDate);
                                }}
                                sx={{ 
                                    width: 32, 
                                    height: 32,
                                    '&:hover': { bgcolor: '#f6f7f8' }
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
                                    <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z"></path>
                                </svg>
                            </IconButton>
                            <Typography variant="h3" sx={{ fontWeight: 700, fontSize: '18px', color: '#101c22' }}>
                                {selectedDate.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}
                            </Typography>
                            <IconButton 
                                size="small"
                                onClick={() => {
                                    const newDate = new Date(selectedDate);
                                    newDate.setMonth(newDate.getMonth() + 1);
                                    if (newDate <= new Date()) {
                                        setSelectedDate(newDate);
                                    }
                                }}
                                sx={{ 
                                    width: 32, 
                                    height: 32,
                                    '&:hover': { bgcolor: '#f6f7f8' }
                                }}
                            >
                                <svg width="20" height="20" viewBox="0 0 256 256" fill="currentColor">
                                    <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"></path>
                                </svg>
                            </IconButton>
                        </Box>

                        {/* Calendar Grid */}
                        <Box sx={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(7, 1fr)', 
                            gap: '4px',
                            textAlign: 'center'
                        }}>
                            {/* Weekday Headers */}
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                                <Box key={i} sx={{ 
                                    py: 1, 
                                    fontSize: '14px', 
                                    fontWeight: 600, 
                                    color: '#6b7f8a' 
                                }}>
                                    {day}
                                </Box>
                            ))}
                            
                            {/* Calendar Days */}
                            {(() => {
                                const year = selectedDate.getFullYear();
                                const month = selectedDate.getMonth();
                                const firstDay = new Date(year, month, 1).getDay();
                                const daysInMonth = new Date(year, month + 1, 0).getDate();
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                const selected = new Date(selectedDate);
                                selected.setHours(0, 0, 0, 0);
                                
                                const days = [];
                                
                                // Empty cells before month starts
                                for (let i = 0; i < firstDay; i++) {
                                    days.push(<Box key={`empty-${i}`} />);
                                }
                                
                                // Days of the month
                                for (let day = 1; day <= daysInMonth; day++) {
                                    const date = new Date(year, month, day);
                                    date.setHours(0, 0, 0, 0);
                                    const isSelected = date.getTime() === selected.getTime();
                                    const isFuture = date > today;
                                    
                                    // Get rating for this day
                                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const dayRating = monthRatings.get(dateStr);
                                    
                                    days.push(
                                        <Box
                                            key={day}
                                            onClick={() => {
                                                if (!isFuture) {
                                                    const newDate = new Date(year, month, day);
                                                    newDate.setHours(0, 0, 0, 0);
                                                    setSelectedDate(newDate);
                                                }
                                            }}
                                            sx={{
                                                width: 40,
                                                height: 40,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderRadius: '12px',
                                                fontSize: '14px',
                                                fontWeight: isSelected ? 700 : 400,
                                                color: isFuture ? '#d1d5db' : isSelected ? '#ffffff' : '#101c22',
                                                bgcolor: isSelected ? '#13a4ec' : 'transparent',
                                                cursor: isFuture ? 'not-allowed' : 'pointer',
                                                transition: 'all 0.2s',
                                                '&:hover': !isFuture ? {
                                                    bgcolor: isSelected ? '#13a4ec' : '#f6f7f8'
                                                } : {}
                                            }}
                                        >
                                            <span style={{ fontSize: '14px' }}>{day}</span>
                                            {dayRating && (
                                                <Box sx={{ 
                                                    position: 'absolute',
                                                    bottom: 2,
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius: '50%',
                                                    backgroundColor: 
                                                        dayRating === 5 ? '#10b981' : 
                                                        dayRating === 4 ? '#3b82f6' : 
                                                        dayRating === 3 ? '#f59e0b' : 
                                                        dayRating === 2 ? '#f97316' : '#ef4444'
                                                }} />
                                            )}
                                        </Box>
                                    );
                                }
                                
                                return days;
                            })()}
                        </Box>
                        
                        {/* Close Calendar Button */}
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                            <MuiButton
                                onClick={() => setIsCalendarExpanded(false)}
                                sx={{
                                    textTransform: 'none',
                                    color: '#6b7f8a',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    '&:hover': { bgcolor: '#f6f7f8' }
                                }}
                            >
                                Close Calendar
                            </MuiButton>
                        </Box>
                        </>
                        )}
                    </CardContent>
                </Card>

                {/* Daily Rating Card */}
                <Card sx={{ 
                    mb: 3, 
                    mx: 0,
                    borderRadius: '16px', 
                    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                    background: '#ffffff',
                    border: '1px solid #e5e7eb'
                }}>
                    <CardContent sx={{ p: '16px' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                            <Typography sx={{ fontSize: '16px', fontWeight: 600, color: '#101c22' }}>
                                Đánh giá ngày hôm nay
                            </Typography>
                            <Typography sx={{ fontSize: '12px', color: '#6b7f8a' }}>
                                {selectedDate.toLocaleDateString('vi-VN')}
                            </Typography>
                        </Box>
                        
                        {/* Emotion Rating */}
                        <Box sx={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 1.5,
                            justifyContent: 'center',
                            my: 2
                        }}>
                            {[
                                { value: 5, label: 'Tuyệt vời', color: '#10b981', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z' },
                                { value: 4, label: 'Tốt', color: '#3b82f6', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 3c-2.33 0-4.32 1.45-5.12 3.5h1.67c.69-1.19 1.97-2 3.45-2s2.75.81 3.45 2h1.67c-.8-2.05-2.79-3.5-5.12-3.5z' },
                                { value: 3, label: 'Bình thường', color: '#f59e0b', icon: 'M9 14h6v1.5H9z M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11z' },
                                { value: 2, label: 'Khó khăn', color: '#f97316', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 9c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z' },
                                { value: 1, label: 'Vất vả', color: '#ef4444', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 9c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8-2.04-2.78-3.5-5.11-3.5z' }
                            ].map((emotion) => (
                                <Box
                                    key={emotion.value}
                                    onClick={() => handleSaveDailyRating(emotion.value)}
                                    onMouseEnter={() => setHoveredStar(emotion.value)}
                                    onMouseLeave={() => setHoveredStar(0)}
                                    sx={{
                                        cursor: 'pointer',
                                        width: 48,
                                        height: 48,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '50%',
                                        backgroundColor: (hoveredStar === emotion.value || dailyRating === emotion.value) 
                                            ? emotion.color 
                                            : dailyRating > 0 && dailyRating !== emotion.value 
                                                ? '#f3f4f6' 
                                                : '#f9fafb',
                                        border: `2px solid ${emotion.color}`,
                                        transition: 'all 0.2s',
                                        transform: (hoveredStar === emotion.value || dailyRating === emotion.value) ? 'scale(1.15)' : 'scale(1)',
                                        boxShadow: (hoveredStar === emotion.value || dailyRating === emotion.value) 
                                            ? `0 4px 12px ${emotion.color}40` 
                                            : 'none',
                                        '&:hover': {
                                            transform: 'scale(1.2)',
                                            boxShadow: `0 6px 16px ${emotion.color}60`
                                        }
                                    }}
                                >
                                    <svg 
                                        width="28" 
                                        height="28" 
                                        viewBox="0 0 24 24" 
                                        fill={(hoveredStar === emotion.value || dailyRating === emotion.value) ? '#ffffff' : emotion.color}
                                    >
                                        <path d={emotion.icon} />
                                    </svg>
                                </Box>
                            ))}
                        </Box>

                        {dailyRating > 0 && (
                            <Typography sx={{ 
                                textAlign: 'center', 
                                fontSize: '14px', 
                                fontWeight: 600,
                                color: dailyRating === 5 ? '#10b981' : 
                                       dailyRating === 4 ? '#3b82f6' : 
                                       dailyRating === 3 ? '#f59e0b' : 
                                       dailyRating === 2 ? '#f97316' : '#ef4444',
                                mt: 1
                            }}>
                                {dailyRating === 5 && 'Ngày tuyệt vời!'}
                                {dailyRating === 4 && 'Ngày tốt!'}
                                {dailyRating === 3 && 'Ngày bình thường'}
                                {dailyRating === 2 && 'Ngày khó khăn'}
                                {dailyRating === 1 && 'Ngày vất vả'}
                            </Typography>
                        )}

                        {/* Optional Notes */}
                        {dailyRating > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={2}
                                    placeholder="Ghi chú về ngày hôm nay... (không bắt buộc)"
                                    value={dailyRatingNotes}
                                    onChange={(e) => setDailyRatingNotes(e.target.value)}
                                    onBlur={() => {
                                        if (dailyRating > 0) {
                                            handleSaveDailyRating(dailyRating);
                                        }
                                    }}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            fontSize: '14px',
                                            borderRadius: '8px'
                                        }
                                    }}
                                />
                            </Box>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Actions - New Design */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h2" sx={{ mb: 2, fontSize: '20px', fontWeight: 700, color: '#101c22' }}>
                        Activities
                    </Typography>
                    <Grid container spacing={2}>
                        {[
                            { 
                                label: 'Milk', 
                                type: 'feeding', 
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M245.66,42.34l-32-32a8,8,0,0,0-11.32,11.32l1.48,1.47L148.65,64.51l-38.22,7.65a8.05,8.05,0,0,0-4.09,2.18L23,157.66a24,24,0,0,0,0,33.94L64.4,233a24,24,0,0,0,33.94,0l83.32-83.31a8,8,0,0,0,2.18-4.09l7.65-38.22,41.38-55.17,1.47,1.48a8,8,0,0,0,11.32-11.32ZM96,107.31,148.69,160,104,204.69,51.31,152ZM81.37,224a7.94,7.94,0,0,1-5.65-2.34L34.34,180.28a8,8,0,0,1,0-11.31L40,163.31,92.69,216,87,221.66A8,8,0,0,1,81.37,224ZM177.6,99.2a7.92,7.92,0,0,0-1.44,3.23l-7.53,37.63L160,148.69,107.31,96l8.63-8.63,37.63-7.53a7.92,7.92,0,0,0,3.23-1.44l58.45-43.84,6.19,6.19Z"></path>
                                    </svg>
                                )
                            },
                            { 
                                label: 'Diaper', 
                                type: 'diaper', 
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M92,140a12,12,0,1,1,12-12A12,12,0,0,1,92,140Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,116Zm-12.27,45.23a45,45,0,0,1-47.46,0,8,8,0,0,0-8.54,13.54,61,61,0,0,0,64.54,0,8,8,0,0,0-8.54-13.54ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.11,88.11,0,0,0-84.09-87.91C120.32,56.38,120,71.88,120,72a8,8,0,0,0,16,0,8,8,0,0,1,16,0,24,24,0,0,1-48,0c0-.73.13-14.3,8.46-30.63A88,88,0,1,0,216,128Z"></path>
                                    </svg>
                                )
                            },
                            { 
                                label: 'Sleep', 
                                type: 'sleep', 
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z"></path>
                                    </svg>
                                ),
                                isSleepTimer: true // Special flag for sleep timer
                            },
                            { 
                                label: 'Bath', 
                                type: 'bath', 
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M64,236a12,12,0,1,1-12-12A12,12,0,0,1,64,236Zm20-44a12,12,0,1,0,12,12A12,12,0,0,0,84,192Zm-64,0a12,12,0,1,0,12,12A12,12,0,0,0,20,192Zm32-32a12,12,0,1,0,12,12A12,12,0,0,0,52,160ZM256,40a8,8,0,0,1-8,8H219.31L191.46,75.86,169.8,202.65a16,16,0,0,1-27.09,8.66l-98-98a16,16,0,0,1,8.69-27.1L180.14,64.54,208,36.69A15.86,15.86,0,0,1,219.31,32H248A8,8,0,0,1,256,40ZM174.21,81.79,56,102l98,98Z"></path>
                                    </svg>
                                )
                            },
                            { 
                                label: 'Measurements', 
                                type: 'measurement', 
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M235.32,73.37,182.63,20.69a16,16,0,0,0-22.63,0L20.68,160a16,16,0,0,0,0,22.63l52.69,52.68a16,16,0,0,0,22.63,0L235.32,96A16,16,0,0,0,235.32,73.37ZM84.68,224,32,171.31l32-32,26.34,26.35a8,8,0,0,0,11.32-11.32L75.31,128,96,107.31l26.34,26.35a8,8,0,0,0,11.32-11.32L107.31,96,128,75.31l26.34,26.35a8,8,0,0,0,11.32-11.32L139.31,64l32-32L224,84.69Z"></path>
                                    </svg>
                                )
                            },
                            { 
                                label: 'Memo', 
                                type: 'memo', 
                                icon: (
                                    <svg width="24" height="24" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M88,96a8,8,0,0,1,8-8h64a8,8,0,0,1,0,16H96A8,8,0,0,1,88,96Zm8,40h64a8,8,0,0,0,0-16H96a8,8,0,0,0,0,16Zm32,16H96a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM224,48V156.69A15.86,15.86,0,0,1,219.31,168L168,219.31A15.86,15.86,0,0,1,156.69,224H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32H208A16,16,0,0,1,224,48ZM48,208H152V160a8,8,0,0,1,8-8h48V48H48Zm120-40v28.7L196.69,168Z"></path>
                                    </svg>
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

                                if (diffDays > 0) return `${diffDays}d ago`;
                                if (diffHours >= 1) return `${diffHours.toFixed(1)}h ago`;
                                if (diffMinutes >= 1) return `${Math.floor(diffMinutes)}m ago`;
                                return 'Just now';
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
                                        bgcolor: (action as any).isSleepTimer && ongoingSleep ? '#fef3c7' : '#ffffff',
                                        borderRadius: '16px',
                                        border: (action as any).isSleepTimer && ongoingSleep ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                                            transform: 'translateY(-2px)'
                                        }
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        {action.icon}
                                        <Typography sx={{ fontSize: '16px', fontWeight: 700, color: '#101c22' }}>
                                            {(action as any).isSleepTimer && ongoingSleep ? 'Bé đã dậy' : action.label}
                                        </Typography>
                                    </Box>
                                    {(action as any).isSleepTimer && ongoingSleep ? (
                                        <Typography sx={{ 
                                            fontSize: '14px', 
                                            color: '#f59e0b',
                                            fontWeight: 600,
                                            pl: 5
                                        }}>
                                            ⏱️ {Math.floor(sleepElapsedTime / 3600)}h {Math.floor((sleepElapsedTime % 3600) / 60)}m {sleepElapsedTime % 60}s
                                        </Typography>
                                    ) : timeSince && !(action as any).isSleepTimer ? (
                                        <Typography sx={{ 
                                            fontSize: '12px', 
                                            color: '#9ca3af',
                                            fontWeight: 500,
                                            pl: 5
                                        }}>
                                            {timeSince}
                                        </Typography>
                                    ) : null}
                                </Box>
                            </Grid>
                            );
                        })}
                    </Grid>
                </Box>

                {/* Summary - New Design */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h2" sx={{ mb: 2, fontSize: '20px', fontWeight: 700, color: '#101c22' }}>
                        Summary
                    </Typography>
                    <Box sx={{
                        bgcolor: '#ffffff',
                        borderRadius: '16px',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                        p: 2
                    }}>
                        {/* Today */}
                        <Box sx={{ mb: 2 }}>
                            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#6b7f8a', mb: 1.5 }}>
                                Today
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', overflow: 'hidden' }}>
                                {/* Milk */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 1,
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    flex: '1 1 0',
                                    minWidth: 0
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M245.66,42.34l-32-32a8,8,0,0,0-11.32,11.32l1.48,1.47L148.65,64.51l-38.22,7.65a8.05,8.05,0,0,0-4.09,2.18L23,157.66a24,24,0,0,0,0,33.94L64.4,233a24,24,0,0,0,33.94,0l83.32-83.31a8,8,0,0,0,2.18-4.09l7.65-38.22,41.38-55.17,1.47,1.48a8,8,0,0,0,11.32-11.32ZM96,107.31,148.69,160,104,204.69,51.31,152ZM81.37,224a7.94,7.94,0,0,1-5.65-2.34L34.34,180.28a8,8,0,0,1,0-11.31L40,163.31,92.69,216,87,221.66A8,8,0,0,1,81.37,224ZM177.6,99.2a7.92,7.92,0,0,0-1.44,3.23l-7.53,37.63L160,148.69,107.31,96l8.63-8.63,37.63-7.53a7.92,7.92,0,0,0,3.23-1.44l58.45-43.84,6.19,6.19Z"></path>
                                    </svg>
                                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a', whiteSpace: 'nowrap' }}>Milk</Typography>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {todayStats.feeding.count}x • {todayStats.feeding.totalAmount}ml
                                        </Typography>
                                    </Box>
                                </Box>
                                
                                {/* Urine */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 1,
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    flex: '1 1 0',
                                    minWidth: 0
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#f59e0b">
                                        <path d="M92,140a12,12,0,1,1,12-12A12,12,0,0,1,92,140Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,116Zm-12.27,45.23a45,45,0,0,1-47.46,0,8,8,0,0,0-8.54,13.54,61,61,0,0,0,64.54,0,8,8,0,0,0-8.54-13.54ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.11,88.11,0,0,0-84.09-87.91C120.32,56.38,120,71.88,120,72a8,8,0,0,0,16,0,8,8,0,0,1,16,0,24,24,0,0,1-48,0c0-.73.13-14.3,8.46-30.63A88,88,0,1,0,216,128Z"></path>
                                    </svg>
                                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a', whiteSpace: 'nowrap' }}>Tè (urine)</Typography>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap' }}>
                                            {todayStats.urine.count}
                                        </Typography>
                                    </Box>
                                </Box>
                                
                                {/* Stool */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 1,
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    flex: '1 1 0',
                                    minWidth: 0
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#f59e0b">
                                        <path d="M92,140a12,12,0,1,1,12-12A12,12,0,0,1,92,140Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,116Zm-12.27,45.23a45,45,0,0,1-47.46,0,8,8,0,0,0-8.54,13.54,61,61,0,0,0,64.54,0,8,8,0,0,0-8.54-13.54ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.11,88.11,0,0,0-84.09-87.91C120.32,56.38,120,71.88,120,72a8,8,0,0,0,16,0,8,8,0,0,1,16,0,24,24,0,0,1-48,0c0-.73.13-14.3,8.46-30.63A88,88,0,1,0,216,128Z"></path>
                                    </svg>
                                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a', whiteSpace: 'nowrap' }}>Ị (defecate)</Typography>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap' }}>
                                            {todayStats.stool.count}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                        
                        {/* Divider */}
                        <Box sx={{ borderTop: '1px solid #e5e7eb', my: 2 }} />
                        
                        {/* Yesterday */}
                        <Box sx={{ mb: 2 }}>
                            <Typography sx={{ fontSize: '14px', fontWeight: 600, color: '#6b7f8a', mb: 1.5 }}>
                                Yesterday
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', overflow: 'hidden' }}>
                                {/* Milk */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 1,
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    flex: '1 1 0',
                                    minWidth: 0
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#13a4ec">
                                        <path d="M245.66,42.34l-32-32a8,8,0,0,0-11.32,11.32l1.48,1.47L148.65,64.51l-38.22,7.65a8.05,8.05,0,0,0-4.09,2.18L23,157.66a24,24,0,0,0,0,33.94L64.4,233a24,24,0,0,0,33.94,0l83.32-83.31a8,8,0,0,0,2.18-4.09l7.65-38.22,41.38-55.17,1.47,1.48a8,8,0,0,0,11.32-11.32ZM96,107.31,148.69,160,104,204.69,51.31,152ZM81.37,224a7.94,7.94,0,0,1-5.65-2.34L34.34,180.28a8,8,0,0,1,0-11.31L40,163.31,92.69,216,87,221.66A8,8,0,0,1,81.37,224ZM177.6,99.2a7.92,7.92,0,0,0-1.44,3.23l-7.53,37.63L160,148.69,107.31,96l8.63-8.63,37.63-7.53a7.92,7.92,0,0,0,3.23-1.44l58.45-43.84,6.19,6.19Z"></path>
                                    </svg>
                                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a', whiteSpace: 'nowrap' }}>Milk</Typography>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {yesterdayStats.feeding.count}x • {yesterdayStats.feeding.totalAmount}ml
                                        </Typography>
                                    </Box>
                                </Box>
                                
                                {/* Urine */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 1,
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    flex: '1 1 0',
                                    minWidth: 0
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#f59e0b">
                                        <path d="M92,140a12,12,0,1,1,12-12A12,12,0,0,1,92,140Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,116Zm-12.27,45.23a45,45,0,0,1-47.46,0,8,8,0,0,0-8.54,13.54,61,61,0,0,0,64.54,0,8,8,0,0,0-8.54-13.54ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.11,88.11,0,0,0-84.09-87.91C120.32,56.38,120,71.88,120,72a8,8,0,0,0,16,0,8,8,0,0,1,16,0,24,24,0,0,1-48,0c0-.73.13-14.3,8.46-30.63A88,88,0,1,0,216,128Z"></path>
                                    </svg>
                                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a', whiteSpace: 'nowrap' }}>Tè (urine)</Typography>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap' }}>
                                            {yesterdayStats.urine.count}
                                        </Typography>
                                    </Box>
                                </Box>
                                
                                {/* Stool */}
                                <Box sx={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: 0.5,
                                    px: 1,
                                    py: 1,
                                    border: '1px solid #e5e7eb',
                                    borderRadius: '8px',
                                    flex: '1 1 0',
                                    minWidth: 0
                                }}>
                                    <svg width="20" height="20" viewBox="0 0 256 256" fill="#f59e0b">
                                        <path d="M92,140a12,12,0,1,1,12-12A12,12,0,0,1,92,140Zm72-24a12,12,0,1,0,12,12A12,12,0,0,0,164,116Zm-12.27,45.23a45,45,0,0,1-47.46,0,8,8,0,0,0-8.54,13.54,61,61,0,0,0,64.54,0,8,8,0,0,0-8.54-13.54ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88.11,88.11,0,0,0-84.09-87.91C120.32,56.38,120,71.88,120,72a8,8,0,0,0,16,0,8,8,0,0,1,16,0,24,24,0,0,1-48,0c0-.73.13-14.3,8.46-30.63A88,88,0,1,0,216,128Z"></path>
                                    </svg>
                                    <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
                                        <Typography sx={{ fontSize: '12px', color: '#6b7f8a', whiteSpace: 'nowrap' }}>Ị (defecate)</Typography>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap' }}>
                                            {yesterdayStats.stool.count}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Box>
                        </Box>
                        
                        {/* AI Insights Button */}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
                            <MuiButton
                                variant="contained"
                                size="small"
                                onClick={() => {
                                    try {
                                        const filteredActivities = (activities || []).filter((activity) => {
                                            try {
                                                const actDate = new Date(activity.timestamp);
                                                if (isNaN(actDate.getTime())) return false;
                                                return (
                                                    actDate.getFullYear() === selectedDate.getFullYear() &&
                                                    actDate.getMonth() === selectedDate.getMonth() &&
                                                    actDate.getDate() === selectedDate.getDate()
                                                );
                                            } catch (e) {
                                                return false;
                                            }
                                        });
                                        const summary: DailySummary = generateDailySummary(filteredActivities);
                                        const result: AnalyzeResult = analyzeActivities(summary);
                                        setSnackbar({ open: true, message: result.suggestions.join(' ; '), severity: 'info' });
                                    } catch (err) {
                                        setSnackbar({ open: true, message: 'Lỗi khi phân tích', severity: 'error' });
                                    }
                                }}
                                sx={{
                                    bgcolor: '#13a4ec',
                                    color: '#ffffff',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    px: 2,
                                    py: 1,
                                    borderRadius: '12px',
                                    '&:hover': {
                                        bgcolor: '#0e8fd4'
                                    }
                                }}
                            >
                                Get AI Insights
                            </MuiButton>
                        </Box>
                    </Box>
                </Box>

                {/* Timeline - New Design */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h2" sx={{ mb: 2, fontSize: '20px', fontWeight: 700, color: '#101c22' }}>
                        Recent activities
                    </Typography>
                    <Box>
                            {/* Activities Timeline - New Design */}
                            <Box sx={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                p: 2,
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)'
                            }}>
                                
                                {(() => {
                                    // Filter and process activities to handle overnight sleep
                                    const filteredActivities = (activities || []).flatMap((activity) => {
                                        try {
                                            const actDate = new Date(activity.timestamp);
                                            if (isNaN(actDate.getTime())) {
                                                return [];
                                            }
                                            
                                            const isSameDay = 
                                                actDate.getFullYear() === selectedDate.getFullYear() &&
                                                actDate.getMonth() === selectedDate.getMonth() &&
                                                actDate.getDate() === selectedDate.getDate();
                                            
                                            if (isSameDay) {
                                                return [activity];
                                            }
                                            
                                            // Check for sleep from previous day that ends on selected date
                                            if (activity.type === 'sleep' && activity.details && activity.details.duration) {
                                                const durationMinutes = Number(activity.details.duration);
                                                const endTime = new Date(actDate.getTime() + durationMinutes * 60000);
                                                
                                                const endsOnSelectedDate = 
                                                    endTime.getFullYear() === selectedDate.getFullYear() &&
                                                    endTime.getMonth() === selectedDate.getMonth() &&
                                                    endTime.getDate() === selectedDate.getDate();
                                                    
                                                if (endsOnSelectedDate) {
                                                    // Return a modified activity with the end time as timestamp
                                                    // We clone it to avoid mutating the original state
                                                    return [{
                                                        ...activity,
                                                        timestamp: endTime,
                                                        // Add a flag to details to indicate it's a carry over
                                                        details: {
                                                            ...activity.details,
                                                            isCarryOver: true
                                                        }
                                                    }];
                                                }
                                            }
                                            
                                            return [];
                                        } catch (error) {
                                            return [];
                                        }
                                    });
                                    
                                    if (loading) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⏳</div>
                                                Đang tải...
                                            </div>
                                        );
                                    }
                                    
                                    if (filteredActivities.length === 0) {
                                        return (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                                                <div style={{ fontSize: '16px', marginBottom: '8px', fontWeight: '500' }}>
                                                    Chưa có hoạt động nào
                                                </div>
                                                <div style={{ fontSize: '14px', color: '#999' }}>
                                                    Chạm vào các nút hành động ở trên để bắt đầu ghi!
                                                </div>
                                            </div>
                                        );
                                    }

                                    const groupedActivities = filteredActivities
                                        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                        .reduce((acc, activity) => {
                                            const timeKey = new Date(activity.timestamp).toLocaleTimeString('vi-VN', {
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            });
                                            if (!acc[timeKey]) {
                                                acc[timeKey] = [];
                                            }
                                            acc[timeKey].push(activity);
                                            return acc;
                                        }, {} as Record<string, Activity[]>);

                                    const timeGroups = Object.entries(groupedActivities);
                                    
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                            {timeGroups.map(([time, activitiesInGroup], groupIndex) => (
                                                <div key={time} style={{ display: 'flex', gap: '16px', position: 'relative' }}>
                                                    {/* Time Column - New Design */}
                                                    <div style={{
                                                        minWidth: '80px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        paddingTop: '12px'
                                                    }}>
                                                        <div style={{
                                                            fontSize: '16px',
                                                            fontWeight: 700,
                                                            color: '#101c22',
                                                            textAlign: 'center',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {time}
                                                        </div>
                                                        
                                                        {/* Timeline connector - New Design */}
                                                        {groupIndex < timeGroups.length - 1 && (() => {
                                                            // Calculate time difference
                                                            const currentTime = new Date(activitiesInGroup[0].timestamp);
                                                            const nextTime = new Date(timeGroups[groupIndex + 1][1][0].timestamp);
                                                            const diffMs = currentTime.getTime() - nextTime.getTime();
                                                            const diffHours = diffMs / (1000 * 60 * 60);
                                                            
                                                            let timeLabel = '';
                                                            if (diffHours < 1) {
                                                                const diffMinutes = Math.round(diffMs / (1000 * 60));
                                                                timeLabel = `${diffMinutes}m`;
                                                            } else if (diffHours < 24) {
                                                                timeLabel = `${diffHours.toFixed(1)}h`;
                                                            } else {
                                                                const diffDays = Math.floor(diffHours / 24);
                                                                timeLabel = `${diffDays}d`;
                                                            }
                                                            
                                                            return (
                                                                <div style={{ 
                                                                    position: 'relative',
                                                                    width: '2px',
                                                                    flexGrow: 1,
                                                                    background: '#e5e7eb',
                                                                    marginTop: '12px',
                                                                    marginBottom: '12px'
                                                                }}>
                                                                    <div style={{
                                                                        position: 'absolute',
                                                                        left: '8px',
                                                                        top: '50%',
                                                                        transform: 'translateY(-50%)',
                                                                        fontSize: '11px',
                                                                        fontWeight: 500,
                                                                        color: '#9ca3af',
                                                                        backgroundColor: '#ffffff',
                                                                        padding: '2px 6px',
                                                                        borderRadius: '4px',
                                                                        whiteSpace: 'nowrap',
                                                                        border: '1px solid #e5e7eb'
                                                                    }}>
                                                                        {timeLabel}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Activity Cards Container */}
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        {activitiesInGroup.map((activity) => {
                                                            // Get color based on activity type
                                                            const getActivityColor = (type: string) => {
                                                                switch (type) {
                                                                    case 'feeding': return '#13a4ec'; // Blue
                                                                    case 'diaper': return '#f59e0b'; // Orange
                                                                    case 'sleep': return '#8b5cf6'; // Purple
                                                                    case 'bath': return '#06b6d4'; // Cyan
                                                                    case 'measurement': return '#10b981'; // Green
                                                                    case 'memo': return '#6b7f8a'; // Gray
                                                                    default: return '#13a4ec';
                                                                }
                                                            };
                                                            
                                                            const activityColor = getActivityColor(activity.type);
                                                            
                                                            return (
                                                            <div
                                                                key={activity.id}
                                                                style={{
                                                                    flex: 1,
                                                                    background: '#ffffff',
                                                                    padding: '12px',
                                                                    borderRadius: '12px',
                                                                    border: '1px solid #e5e7eb',
                                                                    position: 'relative'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                                                    {/* Icon Circle - Color-coded */}
                                                                    <div style={{ 
                                                                        fontSize: '20px',
                                                                        width: '40px',
                                                                        height: '40px',
                                                                        borderRadius: '50%',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        flexShrink: 0
                                                                    }}>
                                                                        {getActivityIcon(activity.type)}
                                                                    </div>
                                                                    
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        {/* Title and Actions Row */}
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                            <div style={{ 
                                                                                fontSize: '15px', 
                                                                                fontWeight: 700,
                                                                                color: activityColor
                                                                            }}>
                                                                                {getActivityLabel(activity.type)}
                                                                            </div>
                                                                            
                                                                            {/* Edit and Delete Buttons */}
                                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                                <button
                                                                                    onClick={() => handleEditActivity(activity)}
                                                                                    style={{
                                                                                        background: 'transparent',
                                                                                        border: 'none',
                                                                                        cursor: 'pointer',
                                                                                        padding: '4px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        borderRadius: '6px',
                                                                                        transition: 'background 0.2s'
                                                                                    }}
                                                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f6f7f8'}
                                                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                                >
                                                                                    <svg width="16" height="16" viewBox="0 0 256 256" fill="#13a4ec">
                                                                                        <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM51.31,160,136,75.31,152.69,92,68,176.68ZM48,179.31,76.69,208H48Zm48,25.38L79.31,188,164,103.31,180.69,120Zm96-96L147.31,64l24-24L216,84.68Z"></path>
                                                                                    </svg>
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleDeleteActivity(activity.id)}
                                                                                    style={{
                                                                                        background: 'transparent',
                                                                                        border: 'none',
                                                                                        cursor: 'pointer',
                                                                                        padding: '4px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        borderRadius: '6px',
                                                                                        transition: 'background 0.2s'
                                                                                    }}
                                                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#fee2e2'}
                                                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                                                >
                                                                                    <svg width="16" height="16" viewBox="0 0 256 256" fill="#ef4444">
                                                                                        <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z"></path>
                                                                                    </svg>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        {/* Activity Details - Compact */}
                                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                                            {activity.details && activity.details.amount && (
                                                                                <span style={{ 
                                                                                    color: activityColor,
                                                                                    padding: '4px 10px', 
                                                                                    borderRadius: '6px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {activity.details.amount}ml
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {activity.details && activity.details.duration && (
                                                                                <span style={{ 
                                                                                    color: activityColor,
                                                                                    padding: '4px 10px', 
                                                                                    borderRadius: '6px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {activity.details.duration}min
                                                                                    {(() => {
                                                                                        // Check if this is a sleep that crossed midnight
                                                                                        if (activity.type === 'sleep') {
                                                                                            // Check explicit carry over flag (from overnight sleep logic)
                                                                                            if (activity.details?.isCarryOver) {
                                                                                                return (
                                                                                                    <span style={{
                                                                                                        marginLeft: '4px',
                                                                                                        fontSize: '11px',
                                                                                                        color: '#f59e0b',
                                                                                                        fontWeight: 500
                                                                                                    }}>
                                                                                                        (từ hôm qua)
                                                                                                    </span>
                                                                                                );
                                                                                            }

                                                                                            if (activity.details.notes) {
                                                                                                const startTimeMatch = activity.details.notes.match(/Bắt đầu: (\d{1,2}):(\d{2}):(\d{2})/);
                                                                                                if (startTimeMatch) {
                                                                                                    const endTime = new Date(activity.timestamp);
                                                                                                    const startHour = parseInt(startTimeMatch[1]);
                                                                                                    const startMinute = parseInt(startTimeMatch[2]);
                                                                                                    
                                                                                                    // Create a start time on the same day first
                                                                                                    const possibleStartTime = new Date(endTime);
                                                                                                    possibleStartTime.setHours(startHour, startMinute, 0, 0);
                                                                                                    
                                                                                                    // If start time is after end time, it must be previous day
                                                                                                    if (possibleStartTime > endTime) {
                                                                                                        possibleStartTime.setDate(possibleStartTime.getDate() - 1);
                                                                                                    }
                                                                                                    
                                                                                                    // Check if it's a different day (overnight sleep)
                                                                                                    const isDifferentDay = possibleStartTime.getDate() !== endTime.getDate() ||
                                                                                                                        possibleStartTime.getMonth() !== endTime.getMonth() ||
                                                                                                                        possibleStartTime.getFullYear() !== endTime.getFullYear();
                                                                                                    
                                                                                                    if (isDifferentDay) {
                                                                                                        return (
                                                                                                            <span style={{
                                                                                                                marginLeft: '4px',
                                                                                                                fontSize: '11px',
                                                                                                                color: '#f59e0b',
                                                                                                                fontWeight: 500
                                                                                                            }}>
                                                                                                                (qua đêm)
                                                                                                            </span>
                                                                                                        );
                                                                                                    }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                        return null;
                                                                                    })()}
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {activity.details && activity.details.weight && (
                                                                                <span style={{ 
                                                                                    color: activityColor,
                                                                                    padding: '4px 10px', 
                                                                                    borderRadius: '6px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {activity.details.weight}g
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {activity.details && activity.details.height && (
                                                                                <span style={{ 
                                                                                    color: activityColor,
                                                                                    padding: '4px 10px', 
                                                                                    borderRadius: '6px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {activity.details.height}cm
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {activity.details && activity.details.temperature && (
                                                                                <span style={{
                                                                                    color: activityColor,
                                                                                    padding: '4px 10px',
                                                                                    borderRadius: '6px',
                                                                                    fontSize: '12px',
                                                                                    fontWeight: 600
                                                                                }}>
                                                                                    {activity.details.temperature}°C
                                                                                </span>
                                                                            )}
                                                                            
                                                                            {/* Urine / Stool badges - Icon based */}
                                                                            {activity.details && activity.details.isUrine && (
                                                                                <div 
                                                                                    title="Tè (Urine)"
                                                                                    style={{
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    fontSize: '20px',
                                                                                    cursor: 'default'
                                                                                }}>
                                                                                    💧
                                                                                </div>
                                                                            )}
                                                                            
                                                                            {activity.details && activity.details.isStool && (
                                                                                <>
                                                                                    {Array.isArray(activity.details.stoolColor) ? (
                                                                                        activity.details.stoolColor.map((c: string) => {
                                                                                            const colorMap: any = {
                                                                                                'vàng': '#f59e0b',
                                                                                                'nâu': '#92400e',
                                                                                                'xám': '#6b7280'
                                                                                            };
                                                                                            const bgColor = colorMap[c.toLowerCase()] || '#6b7280';
                                                                                            return (
                                                                                                <div 
                                                                                                    key={c}
                                                                                                    title={`Ị (defecate) - ${c}`}
                                                                                                    style={{
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center',
                                                                                                    width: '32px',
                                                                                                    height: '32px',
                                                                                                    backgroundColor: bgColor,
                                                                                                    borderRadius: '50%',
                                                                                                    fontSize: '18px',
                                                                                                    cursor: 'default',
                                                                                                    position: 'relative'
                                                                                                }}>
                                                                                                    💩
                                                                                                </div>
                                                                                            );
                                                                                        })
                                                                                    ) : activity.details.stoolColor && (
                                                                                        (() => {
                                                                                            const colorMap: any = {
                                                                                                'vàng': '#f59e0b',
                                                                                                'nâu': '#92400e',
                                                                                                'xám': '#6b7280'
                                                                                            };
                                                                                            const bgColor = colorMap[String(activity.details.stoolColor).toLowerCase()] || '#6b7280';
                                                                                            return (
                                                                                                <div 
                                                                                                    title={`Ị (defecate) - ${activity.details.stoolColor}`}
                                                                                                    style={{
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center',
                                                                                                    width: '32px',
                                                                                                    height: '32px',
                                                                                                    backgroundColor: bgColor,
                                                                                                    borderRadius: '50%',
                                                                                                    fontSize: '18px',
                                                                                                    cursor: 'default'
                                                                                                }}>
                                                                                                    💩
                                                                                                </div>
                                                                                            );
                                                                                        })()
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                        
                                                                        {activity.details && activity.details.notes && (
                                                                            <div style={{ 
                                                                                marginTop: '12px',
                                                                                padding: '12px',
                                                                                background: '#f6f7f8',
                                                                                borderRadius: '8px',
                                                                                fontSize: '14px',
                                                                                color: '#6b7f8a',
                                                                                fontStyle: 'italic'
                                                                            }}>
                                                                                {(() => {
                                                                                    // Check if this is a sleep activity with overnight info
                                                                                    if (activity.type === 'sleep' && activity.details.notes) {
                                                                                        const startTimeMatch = activity.details.notes.match(/Bắt đầu: (\d{1,2}):(\d{2}):(\d{2})/);
                                                                                        if (startTimeMatch) {
                                                                                            const endTime = new Date(activity.timestamp);
                                                                                            const startHour = parseInt(startTimeMatch[1]);
                                                                                            const startMinute = parseInt(startTimeMatch[2]);
                                                                                            
                                                                                            // Create a start time on the same day first
                                                                                            const possibleStartTime = new Date(endTime);
                                                                                            possibleStartTime.setHours(startHour, startMinute, 0, 0);
                                                                                            
                                                                                            // If start time is after end time, it must be previous day
                                                                                            if (possibleStartTime > endTime) {
                                                                                                possibleStartTime.setDate(possibleStartTime.getDate() - 1);
                                                                                            }
                                                                                            
                                                                                            // Check if it's a different day (overnight sleep)
                                                                                            const isDifferentDay = possibleStartTime.getDate() !== endTime.getDate() ||
                                                                                                                   possibleStartTime.getMonth() !== endTime.getMonth() ||
                                                                                                                   possibleStartTime.getFullYear() !== endTime.getFullYear();
                                                                                            
                                                                                            if (isDifferentDay) {
                                                                                                return (
                                                                                                    <>
                                                                                                        😴 Ngủ qua đêm từ {possibleStartTime.toLocaleDateString('vi-VN', { 
                                                                                                            day: '2-digit', 
                                                                                                            month: '2-digit' 
                                                                                                        })} lúc {startHour}:{startTimeMatch[2]} đến {endTime.toLocaleTimeString('vi-VN', {
                                                                                                            hour: '2-digit',
                                                                                                            minute: '2-digit'
                                                                                                        })} sáng
                                                                                                    </>
                                                                                                );
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                    return <>{activity.details.notes.startsWith('Bắt đầu:') ? '😴 ' : '💭 '}{activity.details.notes}</>;
                                                                                })()}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                    </Box>
                </Box>
            </Box>

            {/* Form Modal - Bottom Sheet Style */}
            {showForm && (
                <div 
                    style={{ 
                        position: 'fixed', 
                        top: 0, 
                        left: 0, 
                        right: 0, 
                        bottom: 0, 
                        backgroundColor: 'rgba(0, 0, 0, 0.4)', 
                        zIndex: 1300,
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
                                    {editingActivity ? 'Edit activity' : getActivityTitle(formData.type)}
                                </Typography>
                                {!editingActivity && (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#6b7f8a', fontSize: { xs: '12px', sm: '13px' }, display: { xs: 'none', sm: 'block' } }}>
                                            Bulk mode
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
                                            {isBulkMode ? 'ON' : 'OFF'}
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
                                        <InputLabel id="activity-type-label" sx={{ color: '#6b7f8a' }}>Activity type</InputLabel>
                                        <Select
                                            labelId="activity-type-label"
                                            value={formData.type}
                                            label="Activity type"
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
                                        >
                                            <MenuItem value="feeding">🍼 Feeding</MenuItem>
                                            <MenuItem value="sleep">😴 Sleep</MenuItem>
                                            <MenuItem value="diaper">👶 Diaper change</MenuItem>
                                            <MenuItem value="bath">🛁 Bath</MenuItem>
                                            <MenuItem value="measurement">📏 Measurement</MenuItem>
                                            <MenuItem value="memo">📝 Memo</MenuItem>
                                        </Select>
                                    </FormControl>
                                )}

                                {/* Time Input - Single or Multiple */}
                                {!isBulkMode ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                        <Typography sx={{ fontSize: '14px', fontWeight: 500, color: '#6b7f8a' }}>
                                            Time
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
                                            Time (Multiple)
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
                                            + Add time
                                        </MuiButton>
                                    </Box>
                                )}

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
                                            label={<Typography sx={{ fontSize: '14px', color: '#101c22' }}>Tè (urine)</Typography>}
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
                                            label={<Typography sx={{ fontSize: '14px', color: '#101c22' }}>Ị (defecate)</Typography>}
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
                                                            label={<Typography sx={{ fontSize: '13px', color: '#101c22' }}>{color === 'vàng' ? 'Vàng' : color === 'nâu' ? 'Nâu' : 'Xám'}</Typography>}
                                                        />
                                                    ))}
                                                </Box>
                                                <FormControl fullWidth>
                                                    <InputLabel id="stool-consistency-label" sx={{ color: '#6b7f8a' }}>Hình thù</InputLabel>
                                                    <Select
                                                        labelId="stool-consistency-label"
                                                        value={formData.stoolConsistency || 'bình thường'}
                                                        label="Hình thù"
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
                                                    >
                                                        <MenuItem value="lỏng">Lỏng</MenuItem>
                                                        <MenuItem value="bình thường">Bình thường</MenuItem>
                                                        <MenuItem value="khô">Khô</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            </Box>
                                        )}
                                    </Box>
                                )}

                                {/* Feeding Amount */}
                                {formData.type === 'feeding' && (
                                    <TextField
                                        label="Lượng sữa (ml)"
                                        type="number"
                                        inputMode="decimal"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
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
                                )}

                                {/* Sleep Duration and Time Fields */}
                                {formData.type === 'sleep' && (
                                    <>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                            <TextField
                                                label="Giờ bắt đầu"
                                                type="time"
                                                value={(() => {
                                                    if (formData.notes && formData.notes.includes('Bắt đầu:')) {
                                                        const match = formData.notes.match(/Bắt đầu: (\d{1,2}):(\d{2}):(\d{2})/);
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
                                                    const newNotes = `Bắt đầu: ${newStartTime}:00`;
                                                    setFormData({ ...formData, notes: newNotes });
                                                }}
                                                fullWidth
                                                InputLabelProps={{ shrink: true }}
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
                                                        backgroundColor: '#ffffff',
                                                        paddingLeft: '4px',
                                                        paddingRight: '4px'
                                                    }
                                                }}
                                            />
                                            <TextField
                                                label="Giờ kết thúc (dậy)"
                                                type="time"
                                                value={(() => {
                                                    // Use the activity timestamp as end time
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
                                                    
                                                    // Update formData timestamp internally
                                                    // We'll handle this in the save function
                                                    setFormData({ ...formData, timestamp: newTimestamp.toISOString() });
                                                }}
                                                fullWidth
                                                InputLabelProps={{ shrink: true }}
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
                                                        backgroundColor: '#ffffff',
                                                        paddingLeft: '4px',
                                                        paddingRight: '4px'
                                                    }
                                                }}
                                            />
                                        </Box>
                                        <TextField
                                            label="Thời lượng (phút)"
                                            type="number"
                                            value={formData.duration}
                                            onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
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

                                {/* Measurement Fields */}
                                {formData.type === 'measurement' && (
                                    <>
                                        <Box sx={{ display: 'flex', gap: 2 }}>
                                            <TextField
                                                label="Cân nặng (g)"
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
                                                label="Chiều cao (cm)"
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
                                            label="Nhiệt độ (°C)"
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
                                        label="Ghi chú"
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
                                            Progress: {bulkProgress.completed}/{bulkProgress.total}
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
                                                    ⚠️ Errors ({bulkProgress.errors.length}):
                                                </Typography>
                                                {bulkProgress.errors.slice(0, 3).map((error, index) => (
                                                    <Typography key={index} variant="caption" sx={{ color: '#ff4444', display: 'block', ml: 1, fontSize: '12px' }}>
                                                        • {error}
                                                    </Typography>
                                                ))}
                                                {bulkProgress.errors.length > 3 && (
                                                    <Typography variant="caption" sx={{ color: '#ff4444', display: 'block', ml: 1, fontSize: '12px' }}>
                                                        • ... and {bulkProgress.errors.length - 3} more
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
                            borderTop: '1px solid #e5e7eb',
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
                                    Cancel
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
                                        ? `Creating ${bulkProgress.completed}/${bulkProgress.total}...`
                                        : editingActivity 
                                            ? 'Save' 
                                            : isBulkMode 
                                                ? `Create ${bulkTimes.filter(t => t.trim()).length} activities`
                                                : 'Save'
                                    }
                                </MuiButton>
                            </Box>
                        </Box>
                    </Box>
                </div>
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
        </Box>
        </ErrorBoundary>
    );
};

export default ActivitiesPage;