import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { localeTag } from '../i18n';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { BabyIcon, BathIcon, DeleteIcon, EditIcon, FoodIcon, MeasurementIcon, MemoIcon, MilkIcon, SleepIcon } from '../components/common/icons';
import { useAuth } from '../hooks/useAuth';
import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { Activity } from '../types';
import RecentDaysStrip from '../components/common/RecentDaysStrip';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { calculateStatsForDate } from '../utils/dailyStats';
import { formatHoursMinutes } from '../i18n/format';

const activityColors: Record<string, string> = {
    feeding: '#13a4ec',
    sleep: '#8b5cf6',
    diaper: '#f59e0b',
    measurement: '#10b981',
    memo: '#6b7f8a',
    bath: '#06b6d4',
    dailyRating: '#ec4899'
};

const activityIcons: Record<string, React.ReactNode> = {
    feeding: <FoodIcon />,
    sleep: <SleepIcon />,
    diaper: <BabyIcon />,
    measurement: <MeasurementIcon />,
    memo: <MemoIcon />,
    bath: <BathIcon />
};

const getActivityIcon = (activity: Activity) => {
    const details = activity.details as Record<string, unknown> | undefined;
    if (activity.type === 'feeding' && details?.foodType !== 'solid') {
        return <MilkIcon />;
    }
    return activityIcons[activity.type] || <MemoIcon />;
};

const getActivityDetails = (activity: Activity) => {
    const details = activity.details as Record<string, unknown> | undefined;
    if (!details) return [];

    if (activity.type === 'feeding') {
        const amount = details.amount
            ? `${details.amount}${details.foodType === 'solid' ? 'g' : 'ml'}`
            : '';
        const food = details.foodType === 'solid' ? String(details.foodItem || i18n.t('feeding.solid')) : '';
        return [food ? `${food} (${amount})` : amount].filter(Boolean);
    }
    if (activity.type === 'sleep') return details.duration ? [i18n.t('units.minutes', { count: Number(details.duration) })] : [];
    if (activity.type === 'measurement') {
        return [
            details.weight ? `${details.weight}g` : '',
            details.height ? `${details.height}cm` : '',
            details.temperature ? `${details.temperature}°C` : ''
        ].filter(Boolean);
    }
    if (activity.type === 'diaper') {
        return [details.isUrine ? i18n.t('diaper.urine') : '', details.isStool ? i18n.t('diaper.stool') : ''].filter(Boolean);
    }
    return details.notes ? [String(details.notes)] : [];
};

const TimelinePage: React.FC = () => {
    const { user } = useAuth();
    const { baby } = useBaby();
    const { t } = useTranslation();
    const locale = localeTag();
    const { selectedDate, setSelectedDate } = useDateContext();
    const { ongoingSleep, elapsedSeconds } = useSleepTimer(user?.uid, baby?.id);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editTime, setEditTime] = useState('');
    const [editSleepStartTime, setEditSleepStartTime] = useState('');
    const [editSleepEndTime, setEditSleepEndTime] = useState('');
    const [editNotes, setEditNotes] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const selectedDateTime = selectedDate.getTime();
    const selectedActivities = useMemo(() => activities.filter((activity) => {
        const timestamp = new Date(activity.timestamp);
        return timestamp.getFullYear() === selectedDate.getFullYear()
            && timestamp.getMonth() === selectedDate.getMonth()
            && timestamp.getDate() === selectedDate.getDate();
    }), [activities, selectedDate]);
    const todayStats = useMemo(() => calculateStatsForDate(activities as any, selectedDate), [activities, selectedDate]);
    const previousDate = useMemo(() => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() - 1);
        return date;
    }, [selectedDate]);
    const yesterdayStats = useMemo(() => calculateStatsForDate(activities as any, previousDate), [activities, previousDate]);
    const groupedActivities = selectedActivities.reduce<Record<string, Activity[]>>((groups, activity) => {
        const time = new Date(activity.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
        if (!groups[time]) groups[time] = [];
        groups[time].push(activity);
        return groups;
    }, {});
    const timeGroups = Object.entries(groupedActivities);

    const handleDelete = async (activityId: string) => {
        if (!user?.uid || !window.confirm(t('timeline.confirmDelete'))) return;
        const deleted = await firestore.deleteActivity(user.uid, activityId);
        if (deleted) {
            setActivities((current) => current.filter((activity) => activity.id !== activityId));
        } else {
            setError(t('timeline.deleteFailed'));
        }
    };

    const openEdit = (activity: Activity) => {
        const details = activity.details as Record<string, unknown>;
        setEditingActivity(activity);
        setEditAmount(details.amount ? String(details.amount) : '');
        const notes = details.notes ? String(details.notes) : '';
        setEditNotes(notes);
        setEditTime(new Date(activity.timestamp).toTimeString().slice(0, 5));

        if (activity.type === 'sleep') {
            const endTime = new Date(activity.timestamp);
            const startTimeMatch = notes.match(/(?:Bắt đầu|開始): (\d{1,2}):(\d{2}):\d{2}/);
            const duration = Number(details.duration) || 0;
            const startTime = new Date(endTime.getTime() - duration * 60000);

            setEditSleepStartTime(startTimeMatch
                ? `${startTimeMatch[1].padStart(2, '0')}:${startTimeMatch[2]}`
                : startTime.toTimeString().slice(0, 5));
            setEditSleepEndTime(endTime.toTimeString().slice(0, 5));
        }
    };

    const saveEdit = async () => {
        if (!user?.uid || !editingActivity) return;
        setSavingEdit(true);
        const details = { ...(editingActivity.details as Record<string, unknown>) };
        if ('amount' in details) details.amount = Number(editAmount) || 0;
        let timestamp = editingActivity.timestamp;
        if (editingActivity.type === 'sleep' && editSleepStartTime && editSleepEndTime) {
            const [startHours, startMinutes] = editSleepStartTime.split(':').map(Number);
            const [endHours, endMinutes] = editSleepEndTime.split(':').map(Number);
            const endTime = new Date(editingActivity.timestamp);
            endTime.setHours(endHours, endMinutes, 0, 0);
            const startTime = new Date(endTime);
            startTime.setHours(startHours, startMinutes, 0, 0);
            if (startTime > endTime) startTime.setDate(startTime.getDate() - 1);

            details.duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
            const startNote = `開始: ${editSleepStartTime}:00`;
            details.notes = /(?:Bắt đầu|開始): \d{1,2}:\d{2}:\d{2}/.test(editNotes)
                ? editNotes.replace(/(?:Bắt đầu|開始): \d{1,2}:\d{2}:\d{2}/, startNote)
                : [editNotes.trim(), startNote].filter(Boolean).join('\n');
            timestamp = endTime;
        } else {
            if ('notes' in details || editNotes) details.notes = editNotes;
            if (editTime) {
                const [hours, minutes] = editTime.split(':').map(Number);
                const newTime = new Date(editingActivity.timestamp);
                newTime.setHours(hours, minutes, 0, 0);
                timestamp = newTime;
            }
        }

        const updated = await firestore.updateActivity(user.uid, editingActivity.id, {
            details,
            timestamp
        });
        if (updated) {
            setActivities((current) => current
                .map((activity) => (
                    activity.id === editingActivity.id ? { ...activity, details, timestamp } as Activity : activity
                ))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
            setEditingActivity(null);
        } else {
            setError(t('timeline.updateFailed'));
        }
        setSavingEdit(false);
    };

    useEffect(() => {
        let cancelled = false;
        const loadActivities = async () => {
            if (!user?.uid) return;
            setLoading(true);
            setError('');
            try {
                const data = await firestore.getActivitiesByDateRange(user.uid, selectedDate, 2);
                if (!cancelled) setActivities(data);
            } catch {
                if (!cancelled) setError(i18n.t('timeline.loadFailed'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void loadActivities();
        return () => {
            cancelled = true;
        };
    }, [user?.uid, selectedDate, selectedDateTime]);

    return (
        <Box sx={{ p: { xs: 1, sm: 2 }, width: '100%', maxWidth: 'none', mx: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>
                {t('timeline.title')}
            </Typography>
            <RecentDaysStrip
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                onOpenCalendar={() => setShowDatePicker((current) => !current)}
            />
            {showDatePicker && (
                <TextField
                    type="date"
                    size="small"
                    value={selectedDate.toISOString().slice(0, 10)}
                    onChange={(event) => {
                        const [year, month, day] = event.target.value.split('-').map(Number);
                        if (year && month && day) setSelectedDate(new Date(year, month - 1, day));
                    }}
                    sx={{ mb: 2 }}
                    inputProps={{ 'aria-label': t('common.selectDate') }}
                />
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedDate.toLocaleDateString(locale, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </Typography>
            {ongoingSleep && (
                <Alert severity="info" sx={{ mb: 2, py: 0.25 }}>
                    {t('timeline.sleeping', { duration: formatHoursMinutes(Math.floor(elapsedSeconds / 3600), Math.floor((elapsedSeconds % 3600) / 60)) })}
                </Alert>
            )}
            <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>{t('timeline.summary')}</Typography>
                <Stack spacing={1}>
                    {[
                        { label: selectedDate.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }), stats: todayStats },
                        { label: previousDate.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' }), stats: yesterdayStats }
                    ].map(({ label, stats }) => (
                        <Card key={label} variant="outlined" sx={{ borderRadius: 1.5 }}>
                            <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                                <Typography variant="body2" sx={{ color: '#6b7f8a', fontWeight: 700, mb: 0.75 }}>{label}</Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 0.8fr) minmax(0, 0.8fr)', gap: 0.75, '& .MuiTypography-body1': { fontSize: 15, whiteSpace: 'nowrap' } }}>
                                    <Box><Typography variant="caption" color="text.secondary">{t('feeding.milk')}</Typography><Typography fontWeight={700}>{t('units.times', { count: stats.feeding.count })} · {stats.feeding.totalAmount}ml</Typography></Box>
                                    <Box><Typography variant="caption" color="text.secondary">{t('feeding.solid')}</Typography><Typography fontWeight={700}>{t('units.times', { count: stats.solid.count })} · {stats.solid.totalAmount}g</Typography></Box>
                                    <Box><Typography variant="caption" color="text.secondary">{t('diaper.urine')}</Typography><Typography fontWeight={700}>{stats.urine.count}</Typography></Box>
                                    <Box><Typography variant="caption" color="text.secondary">{t('diaper.stool')}</Typography><Typography fontWeight={700}>{stats.stool.count}</Typography></Box>
                                </Box>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            </Box>

            {loading && <CircularProgress size={28} />}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && !error && selectedActivities.length === 0 && (
                <Typography color="text.secondary">{t('timeline.empty')}</Typography>
            )}
            <Stack spacing={2}>
                {timeGroups.map(([time, activitiesInGroup], groupIndex) => (
                    <Box key={time} sx={{ display: 'flex', gap: { xs: 1, sm: 2 }, position: 'relative' }}>
                        <Box sx={{ minWidth: { xs: 56, sm: 80 }, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 1 }}>
                            <Typography sx={{ fontSize: { xs: 13, sm: 16 }, fontWeight: 700, color: '#101c22', whiteSpace: 'nowrap' }}>{time}</Typography>
                            {groupIndex < timeGroups.length - 1 && (
                                <Box sx={{ width: 2, flexGrow: 1, bgcolor: '#e5e7eb', mt: 1.5, mb: -1.5, position: 'relative' }}>
                                    <Typography sx={{ position: 'absolute', top: '50%', left: 6, transform: 'translateY(-50%)', px: 0.5, py: 0.25, borderRadius: 0.5, bgcolor: 'rgba(255,255,255,0.8)', color: '#a0aab4', fontSize: { xs: 9, sm: 11 }, whiteSpace: 'nowrap' }}>
                                        {(() => {
                                            const current = new Date(activitiesInGroup[0].timestamp).getTime();
                                            const next = new Date(timeGroups[groupIndex + 1][1][0].timestamp).getTime();
                                            const minutes = Math.max(1, Math.round((current - next) / 60000));
                                            return minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`;
                                        })()}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                        <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                            {activitiesInGroup.map((activity) => {
                                const color = activityColors[activity.type] || '#13a4ec';
                                return (
                                    <Card key={activity.id} sx={{ background: 'rgba(255, 255, 255, 0.85)', borderRadius: 1.5, border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                                                <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color, bgcolor: `${color}18` }}>
                                                    {getActivityIcon(activity)}
                                                </Box>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                                                        <Typography sx={{ fontSize: 15, fontWeight: 700, color }}>{t(`activityTypes.${activity.type}`, { defaultValue: activity.type })}</Typography>
                                                        <Box sx={{ display: 'flex' }}>
                                                            <Tooltip title={t('timeline.edit')}><IconButton aria-label={t('timeline.edit')} size="small" onClick={() => openEdit(activity)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                                            <Tooltip title={t('timeline.delete')}><IconButton aria-label={t('timeline.delete')} size="small" onClick={() => void handleDelete(activity.id)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                                        </Box>
                                                    </Box>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                                                        {getActivityDetails(activity).map((detail) => <Typography key={detail} component="span" sx={{ px: 1, py: 0.35, borderRadius: 0.75, color, bgcolor: `${color}12`, fontSize: 12, fontWeight: 600 }}>{detail}</Typography>)}
                                                    </Box>
                                                </Box>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </Stack>
                    </Box>
                ))}
            </Stack>
            <Dialog open={Boolean(editingActivity)} onClose={() => setEditingActivity(null)} fullWidth maxWidth="xs">
                <DialogTitle>{t('timeline.edit')}</DialogTitle>
                <DialogContent>
                    {editingActivity && editingActivity.type !== 'sleep' && (
                        <TextField label={t('activities.form.time')} type="time" value={editTime} onChange={(event) => setEditTime(event.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ mt: 1 }} />
                    )}
                    {editingActivity?.type === 'feeding' && (
                        <TextField label={t('feeding.amountMl')} type="number" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} fullWidth size="small" sx={{ mt: 2 }} />
                    )}
                    {editingActivity?.type === 'sleep' && (
                        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mt: 1 }}>
                            <TextField label={t('sleep.startTime')} type="time" value={editSleepStartTime} onChange={(event) => setEditSleepStartTime(event.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                            <TextField label={t('sleep.endTime')} type="time" value={editSleepEndTime} onChange={(event) => setEditSleepEndTime(event.target.value)} fullWidth size="small" InputLabelProps={{ shrink: true }} />
                        </Box>
                    )}
                    <TextField label={t('common.notes')} value={editNotes} onChange={(event) => setEditNotes(event.target.value)} fullWidth multiline minRows={2} size="small" sx={{ mt: 2 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingActivity(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={() => void saveEdit()} disabled={savingEdit}>
                        {savingEdit ? <CircularProgress size={16} color="inherit" /> : t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default TimelinePage;