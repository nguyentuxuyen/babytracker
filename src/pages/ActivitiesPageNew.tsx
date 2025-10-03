import React, { useState, useEffect, useMemo, Component, ReactNode } from 'react';
import { Box, Typography, Button as MuiButton, TextField, MenuItem, Select, InputLabel, FormControl, IconButton, Card, CardContent, Stack, Grid, Snackbar, Alert } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
// Iconly wrappers used instead of some MUI icons
import { IconFaPlus, IconFaCalendar, IconFaFeeding, IconFaBaby, IconFaSleep, IconFaMeasurement, IconFaMemo, IconFaChart, IconFaUrine, IconFaStool } from '../components/common/FaWrapper';

import { calculateStatsForDate } from '../utils/dailyStats';
import { useBaby } from '../contexts/BabyContext';
import { firestore } from '../firebase/firestore';
import { getCurrentUser } from '../firebase/auth';

interface Activity {
    id: string;
    type: 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo';
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
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Simplified date options generation for debugging
    const dateOptions = useMemo(() => {
        console.log('🔄 Generating date options...');
        if (!baby || !baby.birthDate) {
            console.warn('⚠️ Cannot generate date options: baby or birthDate is missing.');
            return [new Date()]; // Return today as a fallback
        }

        try {
            const options: Date[] = [];
            const startDate = new Date(baby.birthDate);
            startDate.setHours(0, 0, 0, 0); // Normalize start date

            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize today

            // Limit the range to a reasonable number of days, e.g., 5 years
            const fiveYearsInMillis = 5 * 365 * 24 * 60 * 60 * 1000;
            let currentDate = new Date(startDate);

            while (currentDate <= today && (currentDate.getTime() - startDate.getTime()) < fiveYearsInMillis) {
                options.push(new Date(currentDate));
                currentDate.setDate(currentDate.getDate() + 1);
            }

            console.log(`📅 Generated ${options.length} date options from ${startDate.toLocaleDateString()} to ${today.toLocaleDateString()}`);
            return options;
        } catch (error) {
            console.error("💥 Error generating date options:", error);
            return [new Date()]; // Fallback on error
        }
    }, [baby]);

    // Safe date setter function - NORMALIZES the date
    const handleDateChange = (dateIndex: string) => {
        try {
            const index = parseInt(dateIndex);
            if (isNaN(index)) return;

            if (index >= 0 && index < dateOptions.length) {
                const newSelectedDate = new Date(dateOptions[index]);
                newSelectedDate.setHours(0, 0, 0, 0); // Normalize to start of day
                setSelectedDate(newSelectedDate);
                console.log('🔄 Date changed and normalized to:', newSelectedDate.toString());
            } else {
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize to start of day
                setSelectedDate(today);
            }
        } catch (error) {
            console.error('Error in handleDateChange:', error);
        }
    };

    // Simplified getCurrentDateIndex for debugging
    const getCurrentDateIndex = () => {
        console.log('🔍 Finding index for date:', selectedDate);
        if (!dateOptions || dateOptions.length === 0) {
            console.warn('⚠️ No dateOptions available to find index.');
            return 0;
        }
        try {
            // Normalize selectedDate to midnight for accurate comparison
            const selectedDateNormalized = new Date(selectedDate);
            selectedDateNormalized.setHours(0, 0, 0, 0);
            const selectedDateString = selectedDateNormalized.toDateString();

            const index = dateOptions.findIndex(d => {
                // Also normalize dates from the options array before comparing
                const optionDate = new Date(d);
                optionDate.setHours(0, 0, 0, 0);
                return optionDate.toDateString() === selectedDateString;
            });

            if (index === -1) {
                console.warn(`⚠️ Date ${selectedDateString} not found in options. Defaulting to last item.`);
                return dateOptions.length - 1; // Default to the most recent date (today)
            }
            console.log(`🔍 Found index ${index} for date ${selectedDateString}`);
            return index;
        } catch (error) {
            console.error("💥 Error in getCurrentDateIndex:", error);
            return dateOptions.length - 1; // Fallback on error
        }
    };

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
    }>({
        type: 'feeding',
        time: new Date().toTimeString().slice(0, 5), // HH:MM format
        amount: '',
        duration: '',
        notes: '',
        weight: '',
        height: '',
        temperature: ''
    });

    // States for edit and delete functionality
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' | 'warning' }>({
        open: false,
        message: '',
        severity: 'success'
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
                        
                        console.log('Loading activity:', {
                            id: activity.id,
                            originalType: activity.type,
                            normalizedType: normalizedType,
                            originalDetails: activity.details,
                            normalizedDetails: normalizedDetails
                        });
                        
                        return {
                            id: activity.id,
                            type: normalizedType,
                            timestamp: activity.timestamp,
                            details: normalizedDetails
                        };
                    });
                    // Debug: log normalized activities and activities on Aug 1 (any year)
                    try {
                        const safeActivities = convertedActivities.map((a: any) => ({
                            ...a,
                            timestamp: a.timestamp ? new Date(a.timestamp).toISOString() : null
                        }));
                        console.log('DEBUG: loaded activities (normalized):', safeActivities);
                        const aug1 = safeActivities.filter((a: any) => {
                            if (!a.timestamp) return false;
                            const d = new Date(a.timestamp);
                            return d.getUTCDate() === 1 && d.getUTCMonth() === 7; // month 7 = August
                        });
                        console.log('DEBUG: activities on Aug 1 (UTC):', aug1);
                    } catch (err) {
                        console.error('DEBUG: error logging activities', err);
                    }
                    setActivities(convertedActivities);
                } catch (error) {
                    console.error('Error loading activities:', error);
                } finally {
                    setLoading(false);
                }
            }
        };

        loadActivities();
    }, [currentUser]);    

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
            
            // Convert diaper to diaperChange for Firebase
            const firebaseType = formData.type === 'diaper' ? 'diaperChange' : formData.type;
            
            // Create timestamp using selected date and form time
            const [hours, minutes] = formData.time.split(':').map(Number);
            const timestamp = new Date(selectedDate);
            timestamp.setHours(hours, minutes, 0, 0);
            
            // Create activity details based on type
            let details: any = {};
            switch (firebaseType) {
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
                case 'diaperChange':
                    details = {
                        time: timestamp,
                        isUrine: true,
                        isStool: true,
                        notes: formData.notes || ''
                    };
                    break;
                case 'measurement':
                    details = {
                        height: formData.height ? Number(formData.height) : 0,
                        weight: formData.weight ? Number(formData.weight) : 0,
                        temperature: formData.temperature ? Number(formData.temperature) : 0,
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
                type: firebaseType as 'feeding' | 'sleep' | 'diaperChange' | 'measurement' | 'memo',
                timestamp: timestamp,
                details: details
            };

            if (editingActivity) {
                // Update existing activity - for now just delete and recreate
                await firestore.deleteActivity(currentUser.uid, editingActivity.id);
                const savedActivity = await firestore.saveActivity(currentUser.uid, activityData);
                const localActivity = {
                    id: savedActivity.id,
                    type: savedActivity.type === 'diaperChange' ? 'diaper' : savedActivity.type,
                    timestamp: savedActivity.timestamp,
                    details: savedActivity.details
                } as Activity;
                
                // Replace the edited activity in the list
                setActivities(activities.map(activity => 
                    activity.id === editingActivity.id ? localActivity : activity
                ));
                setSnackbar({
                    open: true,
                    message: 'Hoạt động đã được cập nhật!',
                    severity: 'success'
                });
                setEditingActivity(null);
            } else {
                // Create new activity
                const savedActivity = await firestore.saveActivity(currentUser.uid, activityData);
                const localActivity = {
                    id: savedActivity.id,
                    type: savedActivity.type === 'diaperChange' ? 'diaper' : savedActivity.type,
                    timestamp: savedActivity.timestamp,
                    details: savedActivity.details
                } as Activity;
                setActivities([localActivity, ...activities]);
                setSnackbar({
                    open: true,
                    message: 'Hoạt động đã được lưu!',
                    severity: 'success'
                });
            }
            
            setFormData({ 
                type: 'feeding', 
                time: new Date().toTimeString().slice(0, 5),
                amount: '', 
                duration: '', 
                notes: '', 
                weight: '', 
                height: '',
                temperature: '' 
            });
            setShowForm(false);
        } catch (error) {
            console.error('Error saving activity:', error);
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
            case 'feeding': return <IconFaFeeding />;
            case 'sleep': return <IconFaSleep />;
            case 'diaper': return <IconFaBaby />;
            case 'measurement': return <IconFaMeasurement />;
            case 'memo': return <IconFaMemo />;
            default: return <IconFaMemo />;
        }
    };

    const getActivityLabel = (type: string) => {
        switch (type) {
            case 'feeding': return 'Feeding';
            case 'sleep': return 'Sleep';
            case 'diaper': return 'Diaper change';
            case 'measurement': return 'Measurement';
            case 'memo': return 'Memo';
            default: return 'Other';
        }
    };


    // Error boundary effect
    useEffect(() => {
        const handleError = (error: ErrorEvent) => {
            console.error('Global error caught:', error);
            // Don't let the error crash the app
            return true;
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            console.error('Unhandled promise rejection:', event);
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
            console.error('💥 Critical Error calculating stats for date:', err, { activities, selectedDate });
            // Return default stats to prevent the UI from crashing
            return defaultStats;
        }
    }, [activities, selectedDate]);

    // Handle delete activity
    const handleDeleteActivity = async (activityId: string) => {
        if (!currentUser?.uid) return;
        
        try {
            setLoading(true);
            const success = await firestore.deleteActivity(currentUser.uid, activityId);
            if (success) {
                setActivities(activities.filter(activity => activity.id !== activityId));
                setDeleteConfirm(null);
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
            console.error('Error deleting activity:', error);
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
        const activityType = (activity.type as any) === 'diaperChange' ? 'diaper' : activity.type;
        const activityTime = new Date(activity.timestamp);
        
        setFormData({
            type: activityType as any,
            time: activityTime.toTimeString().slice(0, 5),
            amount: activity.details?.amount?.toString() || '',
            duration: activity.details?.duration?.toString() || '',
            notes: activity.details?.notes || '',
            weight: activity.details?.weight?.toString() || '',
            height: activity.details?.height?.toString() || '',
            temperature: activity.details?.temperature?.toString() || ''
        });
        
        setEditingActivity(activity);
        setShowForm(true);
    };

    return (
        <ErrorBoundary>
        <Box sx={{
            minHeight: '100vh',
            p: 0,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}>
            {/* Header */}

            <Box sx={{ p: 2 }}>
                {/* Date Picker Card */}
                <Card sx={{ 
                    mb: 3, 
                    borderRadius: '24px', 
                    boxShadow: 'none',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(255, 255, 255, 0.4)'
                }}>
                    <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <IconFaCalendar />
                            <Typography variant="h6">Select date</Typography>
                        </Stack>
                        <FormControl fullWidth>
                            <Select
                                value={getCurrentDateIndex()}
                                onChange={(e) => handleDateChange(String(e.target.value))}
                            >
                                {dateOptions.map((date, index) => {
                                    const isToday = date.toDateString() === new Date().toDateString();
                                    const isYesterday = date.toDateString() === new Date(Date.now() - 86400000).toDateString();
                                    const isTomorrow = date.toDateString() === new Date(Date.now() + 86400000).toDateString();
                                    let label = date.toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });
                                    if (isToday) label = `Hôm nay (${label})`;
                                    else if (isYesterday) label = `Hôm qua (${label})`;
                                    else if (isTomorrow) label = `Ngày mai (${label})`;
                                    return (
                                        <MenuItem key={index} value={index}>{label}</MenuItem>
                                    );
                                })}
                            </Select>
                        </FormControl>
                    </CardContent>
                </Card>

                {/* Quick Actions */}
                <Card sx={{ 
                    mb: 3, 
                    borderRadius: '24px', 
                    boxShadow: 'none',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(255, 255, 255, 0.4)'
                }}>
                    <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <IconFaPlus />
                            <Typography variant="h6">Add activity</Typography>
                        </Stack>
                        <Grid container spacing={2} justifyContent="center">
                            {[
                                { label: 'Feeding', type: 'feeding', icon: <IconFaFeeding sx={{ fontSize: 36 }} /> },
                                { label: 'Sleep', type: 'sleep', icon: <IconFaSleep sx={{ fontSize: 36 }} /> },
                                { label: 'Diaper change', type: 'diaper', icon: <IconFaBaby sx={{ fontSize: 36 }} /> },
                                { label: 'Measurement', type: 'measurement', icon: <IconFaMeasurement sx={{ fontSize: 36 }} /> },
                                { label: 'Memo', type: 'memo', icon: <IconFaMemo sx={{ fontSize: 36 }} /> },
                            ].map(action => (
                                <Grid item xs={4} sm={2} key={action.type}>
                                    <MuiButton
                                        variant="contained"
                                        fullWidth
                                        onClick={() => {
                                            setEditingActivity(null); // Clear any previous edit
                                            setFormData({ 
                                                type: action.type as any,
                                                time: new Date().toTimeString().slice(0, 5),
                                                amount: '', 
                                                duration: '', 
                                                notes: '', 
                                                weight: '', 
                                                height: '',
                                                temperature: '' 
                                            });
                                            setShowForm(true);
                                        }}
                                        sx={{ 
                                            flexDirection: 'column', 
                                            height: '100px',
                                            borderRadius: '20px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.8)',
                                            color: '#666',
                                            boxShadow: 'none',
                                            border: 'none',
                                            '&:hover': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.1)'
                                            }
                                        }}
                                    >
                                        {action.icon}
                                        <Typography variant="caption" sx={{ mt: 1, fontWeight: 500 }}>{action.label}</Typography>
                                    </MuiButton>
                                </Grid>
                            ))}
                        </Grid>
                    </CardContent>
                </Card>

                <Card sx={{ 
                    mb: 3, 
                    borderRadius: '24px', 
                    boxShadow: 'none',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(255, 255, 255, 0.4)'
                }}>
                    <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <IconFaChart />
                            <Typography variant="h6">Daily Summary</Typography>
                        </Stack>
                        <Grid container spacing={2} textAlign="center">
                            <Grid item xs>
                                <IconFaFeeding sx={{ fontSize: 28 }} />
                                <Typography variant="h6">{todayStats.feeding.count}</Typography>
                                <Typography variant="caption" color="text.secondary">Feedings</Typography>
                            </Grid>
                            {/* <Grid item xs>
                                <IconFaSleep sx={{ fontSize: 28 }} />
                                <Typography variant="h6">{todayStats.sleep.count}</Typography>
                                <Typography variant="caption" color="text.secondary">Sleep Sessions</Typography>
                            </Grid> */}
                            <Grid item xs>
                                <IconFaUrine sx={{ fontSize: 28 }} />
                                <Typography variant="h6">{todayStats.urine.count}</Typography>
                                <Typography variant="caption" color="text.secondary">Wet Diapers</Typography>
                            </Grid>
                            <Grid item xs>
                                <IconFaStool sx={{ fontSize: 28 }} />
                                <Typography variant="h6">{todayStats.stool.count}</Typography>
                                <Typography variant="caption" color="text.secondary">Dirty Diapers</Typography>
                            </Grid>
                            {/* <Grid item xs>
                                <IconFaChart sx={{ fontSize: 28 }} />
                                <Typography variant="h6">{Math.floor(todayStats.sleep.totalDuration/60)}h{todayStats.sleep.totalDuration%60}m</Typography>
                                <Typography variant="caption" color="text.secondary">Total Sleep</Typography>
                            </Grid> */}
                        </Grid>
                    </CardContent>
                </Card>

                {/* Activity List */}
                <Card sx={{ 
                    borderRadius: '24px', 
                    boxShadow: 'none',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(255, 255, 255, 0.4)'
                }}>
                    <CardContent>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <IconFaChart />
                            <Typography variant="h6">Recent activities</Typography>
                        </Stack>
                        <Box>
                            {/* Activities Timeline */}
                            <Box sx={{
                                background: 'rgba(255, 255, 255, 0.7)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                                borderRadius: '24px',
                                p: '24px',
                                mb: '20px',
                                border: 'none',
                                boxShadow: 'none'
                            }}>
                                <div style={{ marginBottom: '16px', fontSize: '16px', fontWeight: '600', color: '#333333' }}>
                                    Timeline - {selectedDate.toLocaleDateString('vi-VN')}
                                </div>
                                
                                {(() => {
                                    const filteredActivities = activities.filter((activity) => {
                                        try {
                                            const actDate = new Date(activity.timestamp);
                                            if (isNaN(actDate.getTime())) {
                                                return false;
                                            }
                                            return (
                                                actDate.getFullYear() === selectedDate.getFullYear() &&
                                                actDate.getMonth() === selectedDate.getMonth() &&
                                                actDate.getDate() === selectedDate.getDate()
                                            );
                                        } catch (error) {
                                            console.error('Error filtering activity:', error, activity);
                                            return false;
                                        }
                                    });
                                    
                                    // Debug: log selectedDate and filteredActivities to ensure filtering is correct
                                    try {
                                        const debugSelected = new Date(selectedDate);
                                        console.log('DEBUG: selectedDate (local):', debugSelected.toString());
                                        const debugFiltered = activities.filter((activity) => {
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
                                        }).map(a => ({ ...a, timestamp: a.timestamp ? new Date(a.timestamp).toString() : null }));
                                        console.log('DEBUG: filteredActivities for selectedDate:', debugFiltered);
                                    } catch (err) {
                                        console.error('DEBUG: error computing selectedDate logs', err);
                                    }

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
                                                    No activities yet
                                                </div>
                                                <div style={{ fontSize: '14px', color: '#999' }}>
                                                    Tap action buttons above to start logging!
                                                </div>
                                            </div>
                                        );
                                    }
                                    
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {filteredActivities
                                                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                                .map((activity, index) => (
                                                <div key={activity.id} style={{ display: 'flex', gap: '16px', position: 'relative' }}>
                                                    {/* Time Column */}
                                                    <div style={{
                                                        minWidth: '50px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        paddingTop: '8px'
                                                    }}>
                                                        <div style={{
                                                            fontSize: '14px',
                                                            fontWeight: '600',
                                                            color: '#333333',
                                                            textAlign: 'center',
                                                            background: 'rgba(255, 255, 255, 0.9)',
                                                            padding: '6px 8px',
                                                            borderRadius: '8px',
                                                            border: '1px solid rgba(0, 0, 0, 0.1)',
                                                            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {new Date(activity.timestamp).toLocaleTimeString('vi-VN', { 
                                                                hour: '2-digit', 
                                                                minute: '2-digit' 
                                                            })}
                                                        </div>
                                                        
                                                        {/* Timeline connector */}
                                                        {index < filteredActivities.length - 1 && (
                                                            <div style={{
                                                                width: '2px',
                                                                height: '40px',
                                                                background: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.2), rgba(0, 0, 0, 0.1))',
                                                                marginTop: '8px'
                                                            }} />
                                                        )}
                                                    </div>

                                                    {/* Activity Card */}
                                                    <div
                                                        style={{
                                                            flex: 1,
                                                            background: 'rgba(255, 255, 255, 0.15)',
                                                            backdropFilter: 'blur(10px)',
                                                            padding: '16px',
                                                            borderRadius: '16px',
                                                            border: '1px solid rgba(255, 255, 255, 0.2)',
                                                            position: 'relative'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <div style={{ 
                                                                fontSize: '24px',
                                                                width: '40px',
                                                                height: '40px',
                                                                borderRadius: '50%',
                                                                background: 'rgba(255, 255, 255, 0.2)',
                                                                backdropFilter: 'blur(10px)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                border: '1px solid rgba(255, 255, 255, 0.3)'
                                                            }}>
                                                                {getActivityIcon(activity.type)}
                                                            </div>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ 
                                                                    fontSize: '16px', 
                                                                    fontWeight: '600', 
                                                                    marginBottom: '8px',
                                                                    color: '#333333'
                                                                }}>
                                                                    {getActivityLabel(activity.type)}
                                                                </div>
                                                            
                                                                {/* Activity Details */}
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                                    {activity.details && activity.details.amount && (
                                                                        <span style={{ 
                                                                            backgroundColor: '#e3f2fd', 
                                                                            padding: '4px 8px', 
                                                                            borderRadius: '8px',
                                                                            fontSize: '12px',
                                                                            color: '#1565c0'
                                                                        }}>
                                                                            {activity.details.amount}ml
                                                                        </span>
                                                                    )}
                                                                    
                                                                    {activity.details && activity.details.duration && (
                                                                        <span style={{ 
                                                                            backgroundColor: '#f3e5f5', 
                                                                            padding: '4px 8px', 
                                                                            borderRadius: '8px',
                                                                            fontSize: '12px',
                                                                            color: '#7b1fa2'
                                                                        }}>
                                                                            {activity.details.duration} phút
                                                                        </span>
                                                                    )}
                                                                    
                                                                    {activity.details && activity.details.weight && (
                                                                        <span style={{ 
                                                                            backgroundColor: '#e8f5e8', 
                                                                            padding: '4px 8px', 
                                                                            borderRadius: '8px',
                                                                            fontSize: '12px',
                                                                            color: '#2e7d32'
                                                                        }}>
                                                                            {activity.details.weight}g
                                                                        </span>
                                                                    )}
                                                                    
                                                                    {activity.details && activity.details.height && (
                                                                        <span style={{ 
                                                                            backgroundColor: '#e8f5e8', 
                                                                            padding: '4px 8px', 
                                                                            borderRadius: '8px',
                                                                            fontSize: '12px',
                                                                            color: '#2e7d32'
                                                                        }}>
                                                                            {activity.details.height}cm
                                                                        </span>
                                                                    )}
                                                                    {activity.details && activity.details.temperature && (
                                                                        <span style={{
                                                                            backgroundColor: '#ffcdd2',
                                                                            padding: '4px 8px',
                                                                            borderRadius: '8px',
                                                                            fontSize: '12px',
                                                                            color: '#c62828'
                                                                        }}>
                                                                            {activity.details.temperature}°C
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                
                                                                {activity.details && activity.details.notes && (
                                                                    <div style={{ 
                                                                        marginTop: '8px',
                                                                        padding: '8px',
                                                                        background: 'rgba(255, 255, 255, 0.1)',
                                                                        backdropFilter: 'blur(5px)',
                                                                        borderRadius: '8px',
                                                                        fontSize: '13px',
                                                                        color: 'rgba(0, 0, 0, 0.7)',
                                                                        fontStyle: 'italic',
                                                                        border: '1px solid rgba(255, 255, 255, 0.2)'
                                                                    }}>
                                                                        💭 {activity.details.notes}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            
                                                            {/* Action Buttons */}
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                <button
                                                                    onClick={() => handleEditActivity(activity)}
                                                                    style={{
                                                                        backgroundColor: '#fff3e0',
                                                                        border: 'none',
                                                                        borderRadius: '8px',
                                                                        padding: '6px 8px',
                                                                        cursor: 'pointer',
                                                                        fontSize: '12px',
                                                                        fontWeight: '500',
                                                                        color: '#f57c00'
                                                                    }}
                                                                >
                                                                    ✏️
                                                                </button>
                                                                
                                                                {deleteConfirm === activity.id ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                        <button
                                                                            onClick={() => handleDeleteActivity(activity.id)}
                                                                            style={{
                                                                                backgroundColor: '#ffebee',
                                                                                border: 'none',
                                                                                borderRadius: '6px',
                                                                                padding: '4px 6px',
                                                                                cursor: 'pointer',
                                                                                fontSize: '10px',
                                                                                color: '#d32f2f'
                                                                            }}
                                                                        >
                                                                            ✓ Xác nhận
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setDeleteConfirm(null)}
                                                                            style={{
                                                                                backgroundColor: '#f5f5f5',
                                                                                border: 'none',
                                                                                borderRadius: '6px',
                                                                                padding: '4px 6px',
                                                                                cursor: 'pointer',
                                                                                fontSize: '10px',
                                                                                color: '#666'
                                                                            }}
                                                                        >
                                                                            ✕ Hủy
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setDeleteConfirm(activity.id)}
                                                                        style={{
                                                                            backgroundColor: '#ffebee',
                                                                            border: 'none',
                                                                            borderRadius: '8px',
                                                                            padding: '6px 8px',
                                                                            cursor: 'pointer',
                                                                            fontSize: '12px',
                                                                            fontWeight: '500',
                                                                            color: '#d32f2f'
                                                                        }}
                                                                    >
                                                                        🗑️
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </Box>
                        </Box>
                    </CardContent>
                </Card>
            </Box>

            {/* Form Modal */}
            {showForm && (
                <div style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0, 0, 0, 0.5)', 
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px'
                }}>
                    <Box sx={{
                        bgcolor: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '24px',
                        p: 3,
                        width: '100%',
                        maxWidth: 400,
                        maxHeight: '80vh',
                        overflow: 'auto',
                        boxShadow: 'none',
                        border: 'none',
                        position: 'relative',
                    }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" color="text.primary">
                                {editingActivity ? '✏️ Edit activity' : '➕ Add new activity'}
                            </Typography>
                            <IconButton onClick={() => setShowForm(false)}>
                                <CloseIcon />
                            </IconButton>
                        </Box>
                        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <FormControl fullWidth>
                                <InputLabel id="activity-type-label">Loại hoạt động</InputLabel>
                                <Select
                                    labelId="activity-type-label"
                                    value={formData.type}
                                    label="Loại hoạt động"
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                                >
                                    <MenuItem value="feeding">🍼 Feeding</MenuItem>
                                    <MenuItem value="sleep">😴 Sleep</MenuItem>
                                    <MenuItem value="diaper">👶 Diaper change</MenuItem>
                                    <MenuItem value="measurement">📏 Measurement</MenuItem>
                                    <MenuItem value="memo">📝 Memo</MenuItem>
                                </Select>
                            </FormControl>
                            <TextField
                                label="Thời gian"
                                type="time"
                                value={formData.time}
                                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                InputLabelProps={{ shrink: true }}
                                inputProps={{ step: 60 }}
                                fullWidth
                            />
                            {formData.type === 'feeding' && (
                                <TextField
                                    label="Lượng sữa (ml)"
                                    type="number"
                                    value={formData.amount}
                                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                    fullWidth
                                />
                            )}
                            {formData.type === 'sleep' && (
                                <TextField
                                    label="Thời lượng (phút)"
                                    type="number"
                                    value={formData.duration}
                                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                                    fullWidth
                                />
                            )}
                            {formData.type === 'measurement' && (
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    <TextField
                                        label="Cân nặng (g)"
                                        type="number"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                                        fullWidth
                                    />
                                    <TextField
                                        label="Chiều cao (cm)"
                                        type="number"
                                        value={formData.height}
                                        onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                        fullWidth
                                    />
                                </Box>
                            )}
                            {formData.type === 'measurement' && (
                                <TextField
                                    label="Nhiệt độ (°C)"
                                    type="number"
                                    value={formData.temperature}
                                    onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                                    fullWidth
                                />
                            )}
                            {(formData.type === 'feeding' || formData.type === 'sleep' || formData.type === 'diaper' || formData.type === 'measurement' || formData.type === 'memo') && (
                                <TextField
                                    label="Ghi chú"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    fullWidth
                                    multiline
                                    minRows={2}
                                />
                            )}
                            <MuiButton type="submit" variant="contained" color="primary" fullWidth disabled={loading}>
                                {editingActivity ? 'Lưu thay đổi' : 'Thêm hoạt động'}
                            </MuiButton>
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
        </ErrorBoundary>
    );
};

export default ActivitiesPage;