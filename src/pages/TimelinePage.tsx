import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { localeTag } from '../i18n';
import { Alert, Box, Button, Card, Snackbar, CardContent, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { DeleteIcon, EditIcon } from '../components/common/icons';
import DayStatsCard from '../components/common/DayStatsCard';
import { formatGap, getActivityColor, getActivityDetails, getActivityIcon, getActivityLabel } from '../components/common/activityDisplay';
import { useAuth } from '../hooks/useAuth';
import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { Activity } from '../types';
import RecentDaysStrip from '../components/common/RecentDaysStrip';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { calculateStatsForDate } from '../utils/dailyStats';
import { formatHoursMinutes } from '../i18n/format';

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
    const [editIsUrine, setEditIsUrine] = useState(false);
    const [editIsStool, setEditIsStool] = useState(false);
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

    // Deletes wait a few seconds so the user can undo; the write happens when the timer fires.
    const UNDO_DELAY_MS = 5000;
    const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
    const pendingDeleteRef = useRef<{ activity: Activity; timer: number } | null>(null);

    const commitDelete = async (activity: Activity) => {
        if (!user?.uid) return;
        const deleted = await firestore.deleteActivity(user.uid, activity.id);
        if (!deleted) {
            setActivities((current) => [activity, ...current]);
            setError(t('timeline.deleteFailed'));
        }
    };

    const flushPendingDelete = () => {
        const pending = pendingDeleteRef.current;
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingDeleteRef.current = null;
        void commitDelete(pending.activity);
    };

    const handleDelete = (activity: Activity) => {
        if (!user?.uid) return;
        flushPendingDelete();
        setActivities((current) => current.filter((item) => item.id !== activity.id));
        const timer = window.setTimeout(() => {
            pendingDeleteRef.current = null;
            setPendingDelete(null);
            void commitDelete(activity);
        }, UNDO_DELAY_MS);
        pendingDeleteRef.current = { activity, timer };
        setPendingDelete(activity);
    };

    const undoDelete = () => {
        const pending = pendingDeleteRef.current;
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingDeleteRef.current = null;
        setPendingDelete(null);
        setActivities((current) => [...current, pending.activity]
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    };

    // Leaving the page still deletes what the user removed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => () => flushPendingDelete(), []);

    const openEdit = (activity: Activity) => {
        const details = activity.details as Record<string, unknown>;
        setEditingActivity(activity);
        setEditAmount(details.amount ? String(details.amount) : '');
        const notes = details.notes ? String(details.notes) : '';
        setEditNotes(notes);
        setEditIsUrine(Boolean(details.isUrine));
        setEditIsStool(Boolean(details.isStool));
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
        if (editingActivity.type === 'diaper') {
            details.isUrine = editIsUrine;
            details.isStool = editIsStool;
        }
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
            type: editingActivity.type,
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
        <Box sx={{ px: 2, pt: 2, pb: 3, width: '100%', maxWidth: 720, mx: 'auto' }}>
            <Typography sx={{ mb: 1.5, fontSize: 20, fontWeight: 700, color: '#101c22' }}>
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
                <DayStatsCard
                    title={t('timeline.summary')}
                    stats={todayStats}
                    previous={yesterdayStats}
                />
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
                                            return formatGap((current - next) / 60000);
                                        })()}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                        <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                            {activitiesInGroup.map((activity) => {
                                const color = getActivityColor(activity);
                                return (
                                    <Card key={activity.id} sx={{ bgcolor: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                                        <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                                                <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color, bgcolor: `${color}18` }}>
                                                    {getActivityIcon(activity)}
                                                </Box>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                                                        <Typography sx={{ fontSize: 15, fontWeight: 700, color }}>{getActivityLabel(activity)}</Typography>
                                                        <Box sx={{ display: 'flex' }}>
                                                            <Tooltip title={t('timeline.edit')}><IconButton aria-label={t('timeline.edit')} onClick={() => openEdit(activity)} sx={{ width: 40, height: 40, color: '#64748b' }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                                            <Tooltip title={t('timeline.delete')}><IconButton aria-label={t('timeline.delete')} onClick={() => handleDelete(activity)} sx={{ width: 40, height: 40, color: '#64748b' }}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
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
                    {editingActivity?.type === 'diaper' && (
                        <FormGroup row sx={{ mt: 1 }}>
                            <FormControlLabel control={<Checkbox checked={editIsUrine} onChange={(event) => setEditIsUrine(event.target.checked)} />} label={t('diaper.urine')} />
                            <FormControlLabel control={<Checkbox checked={editIsStool} onChange={(event) => setEditIsStool(event.target.checked)} />} label={t('diaper.stool')} />
                        </FormGroup>
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
                    <Button variant="contained" onClick={() => void saveEdit()} disabled={savingEdit || (editingActivity?.type === 'diaper' && !editIsUrine && !editIsStool)}>
                        {savingEdit ? <CircularProgress size={16} color="inherit" /> : t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
            <Snackbar
                open={Boolean(pendingDelete)}
                message={t('timeline.deleted')}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                sx={{ bottom: { xs: 'calc(96px + env(safe-area-inset-bottom))' } }}
                action={<Button color="primary" size="small" onClick={undoDelete} sx={{ fontWeight: 700, color: '#7dd3fc' }}>{t('timeline.undo')}</Button>}
            />
        </Box>
    );
};

export default TimelinePage;