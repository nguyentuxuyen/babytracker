import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, Typography, Box, Button, ButtonGroup, TextField, Grid } from '@mui/material';
import LineChart from '../components/common/LineChart';
import MultiLineChart from '../components/common/MultiLineChart';
import { useBaby } from '../contexts/BabyContext';
import { Activity } from '../types';
import { firestore } from '../firebase/firestore';
import { getCurrentUser } from '../firebase/auth';

interface FilterType {
    period: 'day' | 'week' | 'month';
    startDate: Date;
    endDate: Date;
}

interface ChartData {
    date: string;
    feeding: number;
    feedingAmount: number;
    diaper: number;
    urine: number;
    stool: number;
    sleep: number;
    weight?: number;
    height?: number;
    temperature?: number;
}

const StatsPage: React.FC = () => {
    const { baby } = useBaby();
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Filter states
    const [filter, setFilter] = useState<FilterType>({
        period: 'week',
        startDate: baby?.birthDate ? new Date(baby.birthDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        endDate: new Date()
    });

    // Chart visibility states
    const [chartVisibility, setChartVisibility] = useState({
        feeding: true,
        urine: true,
        stool: true,
        weight: true,
        height: true,
        temperature: true
    });

    // Get current user when component mounts
    useEffect(() => {
        const user = getCurrentUser();
        setCurrentUser(user);
    }, []);

    // Load activities from Firebase
    useEffect(() => {
        const loadActivities = async () => {
            if (currentUser?.uid) {
                try {
                    setLoading(true);
                    const userActivities = await firestore.getActivities(currentUser.uid);
                    setActivities(userActivities);
                } catch (error) {
                    console.error('Error loading activities:', error);
                } finally {
                    setLoading(false);
                }
            }
        };

        loadActivities();
    }, [currentUser]);

    // Process data for charts
    const chartData = useMemo(() => {
        const data: ChartData[] = [];
        const startDate = new Date(filter.startDate);
        const endDate = new Date(filter.endDate);
        
        // Create date range
        const dateRange: Date[] = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            dateRange.push(new Date(currentDate));
            
            if (filter.period === 'day') {
                currentDate.setDate(currentDate.getDate() + 1);
            } else if (filter.period === 'week') {
                currentDate.setDate(currentDate.getDate() + 7);
            } else {
                currentDate.setMonth(currentDate.getMonth() + 1);
            }
        }

        // Process activities for each date
        dateRange.forEach(date => {
            const dayActivities = activities.filter(activity => {
                const activityDate = new Date(activity.timestamp);
                
                if (filter.period === 'day') {
                    return activityDate.toDateString() === date.toDateString();
                } else if (filter.period === 'week') {
                    const weekStart = new Date(date);
                    const weekEnd = new Date(date);
                    weekEnd.setDate(weekEnd.getDate() + 6);
                    return activityDate >= weekStart && activityDate <= weekEnd;
                } else {
                    return activityDate.getMonth() === date.getMonth() && 
                           activityDate.getFullYear() === date.getFullYear();
                }
            });

            const daySummary = dayActivities.reduce((acc, activity) => {
                switch (activity.type) {
                    case 'feeding':
                        acc.feeding += 1;
                        acc.feedingAmount += activity.details.amount || 0;
                        break;
                    case 'diaperChange':
                        acc.diaper += 1;
                        if (activity.details.isUrine) acc.urine += 1;
                        if (activity.details.isStool) acc.stool += 1;
                        break;
                    case 'sleep':
                        acc.sleep += activity.details.duration || 0;
                        break;
                    case 'measurement':
                        if (activity.details.weight) acc.weight = activity.details.weight;
                        if (activity.details.height) acc.height = activity.details.height;
                        if (activity.details.temperature) acc.temperature = activity.details.temperature;
                        break;
                    default:
                        break;
                }
                return acc;
            }, {
                date: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
                feeding: 0,
                feedingAmount: 0,
                diaper: 0,
                urine: 0,
                stool: 0,
                sleep: 0,
                weight: undefined,
                height: undefined,
                temperature: undefined
            } as ChartData);

            data.push(daySummary);
        });
        return data;
    }, [activities, filter]);

    const handleFilterChange = (period: 'day' | 'week' | 'month') => {
        setFilter(prev => ({
            ...prev,
            period
        }));
    };

    const handleDateChange = (type: 'start' | 'end', date: string) => {
        setFilter(prev => ({
            ...prev,
            [type === 'start' ? 'startDate' : 'endDate']: new Date(date)
        }));
    };

    const toggleChartVisibility = (dataKey: string) => {
        setChartVisibility(prev => ({
            ...prev,
            [dataKey]: !(prev as any)[dataKey]
        }));
    };

    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ fontSize: 48, mb: 2 }}>📊</Box>
                    <Typography color="text.primary" fontSize={16}>Đang tải thống kê...</Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', p: 2, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            {/* Header & Filter */}
            <Card sx={{ 
                mb: 2, 
                borderRadius: '24px', 
                boxShadow: 'none', 
                border: '1.5px solid rgba(255, 255, 255, 0.4)',
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(20px)',
                p: 1
            }}>
                <CardContent>
                    <Typography variant="h5" fontWeight={700} mb={2} color="#333" textAlign="center">
                        Thống kê của {baby?.name || 'bé'}くん
                    </Typography>
                    <Box mb={2}>
                        <Typography variant="subtitle2" color="#333" mb={1} textAlign="center">
                            Xem theo:
                        </Typography>
                        <Box display="flex" justifyContent="center" mb={2}>
                            <ButtonGroup variant="outlined" color="primary" sx={{
                                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                                borderRadius: '12px',
                                '& .MuiButton-outlined': {
                                    color: '#333',
                                    borderColor: 'rgba(0, 0, 0, 0.23)',
                                    '&:hover': {
                                        backgroundColor: 'rgba(0, 0, 0, 0.04)',
                                    }
                                },
                                '& .MuiButton-contained': {
                                    color: 'white',
                                    backgroundColor: '#673ab7',
                                    '&:hover': {
                                        backgroundColor: '#5e35b1',
                                    }
                                }
                            }}>
                                {[
                                    { key: 'day', label: 'Ngày' },
                                    { key: 'week', label: 'Tuần' },
                                    { key: 'month', label: 'Tháng' }
                                ].map(period => (
                                    <Button
                                        key={period.key}
                                        onClick={() => handleFilterChange(period.key as 'day' | 'week' | 'month')}
                                        variant={filter.period === period.key ? 'contained' : 'outlined'}
                                        sx={{ fontWeight: filter.period === period.key ? 700 : 500, borderRadius: '12px' }}
                                    >
                                        {period.label}
                                    </Button>
                                ))}
                            </ButtonGroup>
                        </Box>
                    </Box>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Từ ngày"
                                type="date"
                                value={filter.startDate.toISOString().split('T')[0]}
                                onChange={(e) => handleDateChange('start', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                size="small"
                                sx={{
                                    backgroundColor: 'transparent',
                                    borderRadius: '12px',
                                    '& .MuiInputBase-input': {
                                        color: '#333',
                                    },
                                    '& .MuiInputLabel-root': {
                                        color: 'rgba(0, 0, 0, 0.6)',
                                    },
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#333',
                                    },
                                    '& .MuiSvgIcon-root': {
                                        color: '#333',
                                    }
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                label="Đến ngày"
                                type="date"
                                value={filter.endDate.toISOString().split('T')[0]}
                                onChange={(e) => handleDateChange('end', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                size="small"
                                sx={{
                                    backgroundColor: 'transparent',
                                    borderRadius: '12px',
                                    '& .MuiInputBase-input': {
                                        color: '#333',
                                    },
                                    '& .MuiInputLabel-root': {
                                        color: 'rgba(0, 0, 0, 0.6)',
                                    },
                                    '& .MuiOutlinedInput-notchedOutline': {
                                        borderColor: 'rgba(0, 0, 0, 0.23)',
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                        borderColor: '#333',
                                    },
                                    '& .MuiSvgIcon-root': {
                                        color: '#333',
                                    }
                                }}
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Charts */}
            <Card sx={{ 
                mb: 2, 
                borderRadius: '24px', 
                boxShadow: 'none', 
                border: '1.5px solid rgba(255, 255, 255, 0.4)',
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(20px)',
                p: 1
            }}>
                <CardContent>
                    <Box display="flex" flexDirection="column" gap={2}>
                        {/* Feeding Charts */}
                        <LineChart
                            data={chartData}
                            dataKey="feedingAmount"
                            title="🥛 Total feeding amount over time"
                            color="#81C784"
                            unit="ml"
                            verticalLabels={filter.period === 'day'}
                        />
                        {/* Multi-line Activity Chart */}
                        <MultiLineChart
                            data={chartData}
                            title="👶 Hoạt động theo thời gian"
                            verticalLabels={filter.period === 'day'}
                            lines={[
                                {
                                    dataKey: 'feeding',
                                    label: 'Feeding',
                                    color: '#4FC3F7',
                                    visible: chartVisibility.feeding
                                },
                                {
                                    dataKey: 'urine',
                                    label: 'Urine',
                                    color: '#81C784',
                                    visible: chartVisibility.urine
                                },
                                {
                                    dataKey: 'stool',
                                    label: 'Stool',
                                    color: '#CE93D8',
                                    visible: chartVisibility.stool
                                }
                            ]}
                            onToggleLine={toggleChartVisibility}
                            unit=" lần"
                        />
                        {/* Measurement Chart (Weight, Height & Temperature) */}
                        {(chartData.some(d => d.weight) || chartData.some(d => d.height) || chartData.some(d => d.temperature)) && (
                            <MultiLineChart
                                data={chartData.filter(d => d.weight || d.height || d.temperature)}
                                title="⚖️ Cân nặng, Chiều cao & Nhiệt độ"
                                verticalLabels={filter.period === 'day'}
                                lines={[
                                    {
                                        dataKey: 'weight',
                                        label: 'Cân nặng (g)',
                                        color: '#F48FB1',
                                        visible: chartVisibility.weight
                                    },
                                    {
                                        dataKey: 'height',
                                        label: 'Chiều cao (cm)',
                                        color: '#A5D6A7',
                                        visible: chartVisibility.height
                                    },
                                    {
                                        dataKey: 'temperature',
                                        label: 'Nhiệt độ (°C)',
                                        color: '#FFD54F',
                                        visible: chartVisibility.temperature
                                    }
                                ]}
                                onToggleLine={toggleChartVisibility}
                            />
                        )}
                    </Box>
                </CardContent>
            </Card>
        </Box>
    );
};

export default StatsPage;