import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { localeTag } from '../i18n';
import { Alert, Box, Button, Card, CardActionArea, Chip, Snackbar, CardContent, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup, IconButton, Stack, TextField, Typography } from '@mui/material';
import { CloseIcon, DeleteIcon, EditIcon } from '../components/common/icons';
import DayStatsCard from '../components/common/DayStatsCard';
import { ACTIVITY_COLORS, formatDuration, getActivityColor, getActivityDetails, getActivityIcon, getActivityLabel, isSolidFeeding } from '../components/common/activityDisplay';
import DayBand from '../components/common/DayBand';
import { useAuth } from '../hooks/useAuth';
import { useMoments } from '../hooks/useMoments';
import { toLocalDateKey } from '../firebase/moments';
import MomentCard from '../components/common/MomentCard';
import { useMomentSheets } from '../components/common/MomentSheets';
import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { Activity } from '../types';
import RecentDaysStrip from '../components/common/RecentDaysStrip';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { calculateStatsForDate } from '../utils/dailyStats';
import { formatHoursMinutes } from '../i18n/format';
import { MAX_FOODS_PER_MEAL, foodPortionsOf } from '../domain/activitySchema.mjs';
import PageHeader from '../components/common/PageHeader';

type FilterKey = 'all' | 'milk' | 'solid' | 'sleep' | 'diaper' | 'other';
const FILTERS: FilterKey[] = ['all', 'milk', 'solid', 'sleep', 'diaper', 'other'];
const FILTER_COLORS: Record<Exclude<FilterKey, 'all'>, string> = {
    milk: ACTIVITY_COLORS.feeding,
    solid: ACTIVITY_COLORS.solid,
    sleep: ACTIVITY_COLORS.sleep,
    diaper: ACTIVITY_COLORS.diaper,
    other: ACTIVITY_COLORS.memo
};
const filterKeyOf = (activity: Activity): Exclude<FilterKey, 'all'> => {
    if (activity.type === 'feeding') return isSolidFeeding(activity) ? 'solid' : 'milk';
    if (activity.type === 'sleep' || activity.type === 'diaper') return activity.type;
    return 'other';
};

// A sleep is stored at its wake-up time; show "08:10–15:10" so it does not read as starting then.
const sleepRangeOf = (activity: Activity): string[] => {
    const minutes = Number((activity.details as any)?.duration);
    if (activity.type !== 'sleep' || !(minutes > 0)) return [];
    const end = new Date(activity.timestamp);
    const start = new Date(end.getTime() - minutes * 60000);
    const time = (date: Date) => date.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
    return [`${time(start)}–${time(end)}`];
};

// "cơm, chuối + bơ" typed in one go becomes three dishes.
const splitFoodNames = (value: string) => value.split(/[,+、，]/).map((name) => name.replace(/\s+/g, ' ').trim()).filter(Boolean);
const addUniqueFoods = (current: string[], names: string[]) => {
    const result = [...current];
    names.forEach((name) => {
        if (!result.some((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase())) result.push(name);
    });
    return result.slice(0, MAX_FOODS_PER_MEAL);
};
const gramsOf = (value: string | undefined) => Number(String(value ?? '').replace(',', '.')) || 0;

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
    // Solid-food meals: the dishes, the grams typed for each (by name) and a dish being typed.
    const [editFoods, setEditFoods] = useState<string[]>([]);
    const [editFoodGrams, setEditFoodGrams] = useState<Record<string, string>>({});
    const [editFoodInput, setEditFoodInput] = useState('');
    const selectedDateTime = selectedDate.getTime();
    const selectedActivities = useMemo(() => activities.filter((activity) => {
        const timestamp = new Date(activity.timestamp);
        return timestamp.getFullYear() === selectedDate.getFullYear()
            && timestamp.getMonth() === selectedDate.getMonth()
            && timestamp.getDate() === selectedDate.getDate();
    }), [activities, selectedDate]);
    const { moments } = useMoments(user?.uid);
    const { openMoment, addMoment, sheets: momentSheets } = useMomentSheets(user?.uid, moments);
    const selectedDayKey = toLocalDateKey(selectedDate);
    const dayMoments = useMemo(() => moments.filter((moment) => moment.date === selectedDayKey), [moments, selectedDayKey]);
    const todayStats = useMemo(() => calculateStatsForDate(activities as any, selectedDate), [activities, selectedDate]);
    const previousDate = useMemo(() => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() - 1);
        return date;
    }, [selectedDate]);
    const yesterdayStats = useMemo(() => calculateStatsForDate(activities as any, previousDate), [activities, previousDate]);
    const [typeFilter, setTypeFilter] = useState<FilterKey>('all');
    const visibleActivities = typeFilter === 'all'
        ? selectedActivities
        : selectedActivities.filter((activity) => filterKeyOf(activity) === typeFilter);
    // Milk feeds, newest first, over everything loaded (so the first feed of the day sees last night's).
    const milkFeeds = useMemo(() => activities
        .filter((activity) => filterKeyOf(activity) === 'milk')
        .map((activity) => new Date(activity.timestamp).getTime())
        .sort((a, b) => b - a), [activities]);
    const milkGapOf = (activity: Activity) => {
        if (filterKeyOf(activity) !== 'milk') return '';
        const time = new Date(activity.timestamp).getTime();
        const previous = milkFeeds.find((other) => other < time);
        return previous ? t('timeline.sincePreviousFeed', { gap: formatDuration((time - previous) / 60000) }) : '';
    };

    // Deletes wait a few seconds so the user can undo; the write happens when the timer fires.
    const UNDO_DELAY_MS = 5000;
    const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
    // The record the user tapped delete on, waiting for them to confirm.
    const [confirmingDelete, setConfirmingDelete] = useState<Activity | null>(null);
    const pendingDeleteRef = useRef<{ activity: Activity; timer: number } | null>(null);

    const commitDelete = async (activity: Activity) => {
        if (!user?.uid) return;
        const deleted = await firestore.deleteActivity(user.uid, activity.id);
        if (!deleted) {
            setActivities((current) => (current.some((item) => item.id === activity.id)
                ? current
                : [activity, ...current].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())));
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
        setActivities((current) => [...current.filter((item) => item.id !== pending.activity.id), pending.activity]
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
        const portions = activity.type === 'feeding' && details.foodType === 'solid' ? foodPortionsOf(details) : [];
        setEditFoods(portions.map((portion) => portion.name));
        setEditFoodGrams(Object.fromEntries(portions
            .filter((portion) => portions.length > 1 && portion.grams !== null)
            .map((portion) => [portion.name, String(portion.grams)])));
        setEditFoodInput('');

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

    const isSolidEdit = editingActivity?.type === 'feeding'
        && (editingActivity.details as Record<string, unknown>)?.foodType === 'solid';
    const addEditFoods = (text: string) => {
        const names = splitFoodNames(text);
        if (names.length > 0) setEditFoods((current) => addUniqueFoods(current, names));
        setEditFoodInput('');
    };
    // ✕ on a dish: drop it and its grams.
    const removeEditFood = (food: string) => {
        setEditFoods((current) => current.filter((item) => item !== food));
        setEditFoodGrams((current) => {
            const { [food]: _dropped, ...rest } = current;
            return rest;
        });
    };
    const editTotalGrams = Math.round(editFoods.reduce((sum, food) => sum + gramsOf(editFoodGrams[food]), 0) * 10) / 10;

    const saveEdit = async () => {
        if (!user?.uid || !editingActivity) return;
        setSavingEdit(true);
        const details = { ...(editingActivity.details as Record<string, unknown>) };
        if ('amount' in details) details.amount = Number(editAmount) || 0;
        if (isSolidEdit) {
            // Text still in the dish box counts too.
            const foods = addUniqueFoods(editFoods, splitFoodNames(editFoodInput));
            details.foodItems = foods;
            details.foodItem = foods.join(', ');
            const grams = foods.map((food) => gramsOf(editFoodGrams[food]));
            if (foods.length > 1 && grams.some((value) => value > 0)) {
                details.foodGrams = grams;
                details.amount = Math.round(grams.reduce((sum, value) => sum + value, 0) * 10) / 10;
            } else {
                delete details.foodGrams;
            }
        }
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

    // Live list: shows what this device already has right away (no wait on a slow
    // connection), then the server's data and changes from other devices.
    useEffect(() => {
        if (!user?.uid) return undefined;
        setLoading(true);
        setError('');
        return firestore.subscribeActivitiesByDateRange(
            user.uid,
            selectedDate,
            2,
            (data) => {
                // A record waiting in the undo bar stays hidden until it is deleted or restored.
                const hiddenId = pendingDeleteRef.current?.activity.id;
                setActivities(hiddenId ? data.filter((activity) => activity.id !== hiddenId) : data);
                setLoading(false);
            },
            () => setError(i18n.t('timeline.loadFailed'))
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid, selectedDateTime]);

    return (
        <Box sx={{ px: 2, pt: 2, pb: 3, width: '100%', maxWidth: 720, mx: 'auto' }}>
            <PageHeader title={t('timeline.title')} />
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
            <DayBand date={selectedDate} activities={selectedActivities} ongoingSleepStart={ongoingSleep?.startTime} />
            <Box sx={{ mb: 3 }}>
                <DayStatsCard
                    title={t('timeline.summary')}
                    stats={todayStats}
                    previous={yesterdayStats}
                />
            </Box>

            <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dayMoments.map((moment) => (
                    <MomentCard key={moment.id} moment={moment} showDate={false} onClick={() => openMoment(moment)} />
                ))}
                <Button
                    onClick={() => addMoment(selectedDate)}
                    sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 600, color: '#ec4899', borderRadius: '12px', px: 1.5 }}
                >
                    + {t('moments.addForDay')}
                </Button>
            </Box>

            {loading && <CircularProgress size={28} />}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && !error && selectedActivities.length === 0 && (
                <Typography color="text.secondary">{t('timeline.empty')}</Typography>
            )}
            {selectedActivities.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', mb: 1.5, pb: 0.25, mx: -2, px: 2, '&::-webkit-scrollbar': { display: 'none' } }}>
                    {FILTERS.map((filter) => {
                        const count = filter === 'all' ? selectedActivities.length : selectedActivities.filter((activity) => filterKeyOf(activity) === filter).length;
                        if (filter !== 'all' && count === 0) return null;
                        const active = typeFilter === filter;
                        const color = filter === 'all' ? '#13a4ec' : FILTER_COLORS[filter];
                        return (
                            <Chip
                                key={filter}
                                label={`${t(`timeline.filter.${filter}`)} ${count}`}
                                onClick={() => setTypeFilter(filter)}
                                aria-pressed={active}
                                sx={{
                                    flexShrink: 0,
                                    fontWeight: 700,
                                    fontSize: 13,
                                    height: 34,
                                    borderRadius: '999px',
                                    color: active ? '#ffffff' : '#334155',
                                    bgcolor: active ? color : '#ffffff',
                                    border: `1px solid ${active ? color : '#e5e7eb'}`,
                                    '&:hover': { bgcolor: active ? color : '#f8fafc' }
                                }}
                            />
                        );
                    })}
                </Box>
            )}
            {visibleActivities.length > 0 && (
                <Card sx={{ bgcolor: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                    {visibleActivities.map((activity, index) => {
                        const color = getActivityColor(activity);
                        const details = [...sleepRangeOf(activity), ...getActivityDetails(activity)];
                        const gap = milkGapOf(activity);
                        return (
                            <CardActionArea
                                key={activity.id}
                                onClick={() => openEdit(activity)}
                                sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1, minHeight: 52, borderRadius: 0, borderTop: index === 0 ? 'none' : '1px solid #f1f5f9' }}
                            >
                                <Typography sx={{ width: 44, flexShrink: 0, fontSize: 14, fontWeight: 700, color: '#101c22', fontVariantNumeric: 'tabular-nums' }}>
                                    {new Date(activity.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                                <Box sx={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color, bgcolor: `${color}18`, '& svg': { fontSize: 17 } }}>
                                    {getActivityIcon(activity)}
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography noWrap sx={{ fontSize: 15, color: '#101c22' }}>
                                        <Box component="span" sx={{ fontWeight: 700, color }}>{getActivityLabel(activity)}</Box>
                                        {details.length > 0 && <Box component="span" sx={{ fontWeight: 600 }}>{` · ${details.join(' · ')}`}</Box>}
                                    </Typography>
                                    {gap && (
                                        <Typography noWrap sx={{ fontSize: 12, color: '#5b6b75' }}>{gap}</Typography>
                                    )}
                                </Box>
                                <EditIcon aria-hidden sx={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }} />
                            </CardActionArea>
                        );
                    })}
                </Card>
            )}
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
                    {editingActivity?.type === 'feeding' && !isSolidEdit && (
                        <TextField label={t('feeding.amountMl')} type="number" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} fullWidth size="small" sx={{ mt: 2 }} />
                    )}
                    {isSolidEdit && (
                        <Box sx={{ mt: 2 }}>
                            {editFoods.length > 0 && (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
                                    {editFoods.map((food) => (
                                        <Chip
                                            key={food}
                                            label={food}
                                            onDelete={() => removeEditFood(food)}
                                            sx={{ fontWeight: 600 }}
                                        />
                                    ))}
                                </Box>
                            )}
                            <TextField
                                label={editFoods.length > 0 ? t('feeding.addAnotherFood') : t('feeding.foodName')}
                                placeholder={t('feeding.foodNamePlaceholder')}
                                value={editFoodInput}
                                onChange={(event) => setEditFoodInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && editFoodInput.trim()) {
                                        event.preventDefault();
                                        addEditFoods(editFoodInput);
                                    }
                                }}
                                onBlur={() => { if (editFoodInput.trim()) addEditFoods(editFoodInput); }}
                                fullWidth
                                size="small"
                            />
                            {editFoods.length > 1 ? (
                                <Box sx={{ mt: 2 }}>
                                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#5b6b75', mb: 1 }}>{t('feeding.gramsPerFood')}</Typography>
                                    <Stack spacing={1}>
                                        {editFoods.map((food) => (
                                            <Box key={food} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, overflowWrap: 'anywhere' }}>{food}</Typography>
                                                <TextField
                                                    type="number"
                                                    size="small"
                                                    placeholder="0"
                                                    value={editFoodGrams[food] ?? ''}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        setEditFoodGrams((current) => ({ ...current, [food]: value }));
                                                    }}
                                                    inputProps={{ inputMode: 'decimal', 'aria-label': t('feeding.gramsOf', { food }) }}
                                                    InputProps={{ endAdornment: <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>g</Typography> }}
                                                    sx={{ width: 110, flexShrink: 0 }}
                                                />
                                                <IconButton
                                                    size="small"
                                                    aria-label={t('feeding.removeFood', { food })}
                                                    onClick={() => removeEditFood(food)}
                                                    sx={{ flexShrink: 0, color: '#94a3b8' }}
                                                >
                                                    <CloseIcon sx={{ fontSize: 20 }} />
                                                </IconButton>
                                            </Box>
                                        ))}
                                    </Stack>
                                    {editTotalGrams > 0 && (
                                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#5b6b75', mt: 1, textAlign: 'right' }}>
                                            {t('feeding.totalGrams', { amount: editTotalGrams })}
                                        </Typography>
                                    )}
                                </Box>
                            ) : (
                                <TextField label={t('feeding.amountG')} type="number" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} fullWidth size="small" sx={{ mt: 2 }} />
                            )}
                        </Box>
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
                    <Button
                        color="error"
                        startIcon={<DeleteIcon fontSize="small" />}
                        onClick={() => { const activity = editingActivity; setEditingActivity(null); setConfirmingDelete(activity); }}
                        sx={{ mr: 'auto' }}
                    >
                        {t('timeline.deleteShort')}
                    </Button>
                    <Button onClick={() => setEditingActivity(null)}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={() => void saveEdit()} disabled={savingEdit || (editingActivity?.type === 'diaper' && !editIsUrine && !editIsStool)}>
                        {savingEdit ? <CircularProgress size={16} color="inherit" /> : t('common.save')}
                    </Button>
                </DialogActions>
            </Dialog>
            <Dialog open={Boolean(confirmingDelete)} onClose={() => setConfirmingDelete(null)} fullWidth maxWidth="xs">
                <DialogTitle>{t('timeline.confirmDelete')}</DialogTitle>
                {confirmingDelete && (
                    <DialogContent>
                        <Typography sx={{ fontWeight: 700, color: getActivityColor(confirmingDelete) }}>
                            {getActivityLabel(confirmingDelete)} · {new Date(confirmingDelete.timestamp).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
                            {getActivityDetails(confirmingDelete).join(' · ')}
                        </Typography>
                    </DialogContent>
                )}
                <DialogActions>
                    <Button onClick={() => setConfirmingDelete(null)}>{t('common.cancel')}</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={() => {
                            if (confirmingDelete) handleDelete(confirmingDelete);
                            setConfirmingDelete(null);
                        }}
                    >
                        {t('timeline.delete')}
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
            {momentSheets}
        </Box>
    );
};

export default TimelinePage;