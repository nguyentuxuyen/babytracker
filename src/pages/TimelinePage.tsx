import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import BedtimeOutlinedIcon from '@mui/icons-material/BedtimeOutlined';
import ChildCareOutlinedIcon from '@mui/icons-material/ChildCareOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import MonitorHeartOutlinedIcon from '@mui/icons-material/MonitorHeartOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import BathtubOutlinedIcon from '@mui/icons-material/BathtubOutlined';
import { useAuth } from '../hooks/useAuth';
import { useBaby } from '../contexts/BabyContext';
import { useDateContext } from '../contexts/DateContext';
import { firestore } from '../firebase/firestore';
import { Activity } from '../types';
import RecentDaysStrip from '../components/common/RecentDaysStrip';
import { useSleepTimer } from '../hooks/useSleepTimer';
import { calculateStatsForDate } from '../utils/dailyStats';

const activityLabels: Record<string, string> = {
    feeding: '授乳',
    sleep: '睡眠',
    diaper: 'おむつ',
    measurement: '計測',
    memo: 'メモ',
    bath: 'お風呂',
    dailyRating: '日記'
};

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
    feeding: <RestaurantOutlinedIcon />,
    sleep: <BedtimeOutlinedIcon />,
    diaper: <ChildCareOutlinedIcon />,
    measurement: <MonitorHeartOutlinedIcon />,
    memo: <EditNoteOutlinedIcon />,
    bath: <BathtubOutlinedIcon />
};

const getActivityDetails = (activity: Activity) => {
    const details = activity.details as Record<string, unknown> | undefined;
    if (!details) return [];

    if (activity.type === 'feeding') {
        const amount = details.amount ? `${details.amount}ml` : '';
        const food = details.foodType === 'solid' ? String(details.foodItem || 'Solid Food') : '';
        return [food ? `${food} (${amount})` : amount].filter(Boolean);
    }
    if (activity.type === 'sleep') return details.duration ? [`${details.duration}min`] : [];
    if (activity.type === 'measurement') {
        return [
            details.weight ? `${details.weight}g` : '',
            details.height ? `${details.height}cm` : '',
            details.temperature ? `${details.temperature}°C` : ''
        ].filter(Boolean);
    }
    if (activity.type === 'diaper') {
        return [details.isUrine ? 'おしっこ' : '', details.isStool ? 'うんち' : ''].filter(Boolean);
    }
    return details.notes ? [String(details.notes)] : [];
};

const TimelinePage: React.FC = () => {
    const { user } = useAuth();
    const { baby } = useBaby();
    const { selectedDate, setSelectedDate } = useDateContext();
    const { ongoingSleep, elapsedSeconds } = useSleepTimer(user?.uid, baby?.id);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
    const [editAmount, setEditAmount] = useState('');
    const [editDuration, setEditDuration] = useState('');
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
        const time = new Date(activity.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        if (!groups[time]) groups[time] = [];
        groups[time].push(activity);
        return groups;
    }, {});
    const timeGroups = Object.entries(groupedActivities);

    const handleDelete = async (activityId: string) => {
        if (!user?.uid || !window.confirm('この記録を削除しますか？')) return;
        const deleted = await firestore.deleteActivity(user.uid, activityId);
        if (deleted) {
            setActivities((current) => current.filter((activity) => activity.id !== activityId));
        } else {
            setError('記録を削除できませんでした。');
        }
    };

    const openEdit = (activity: Activity) => {
        const details = activity.details as Record<string, unknown>;
        setEditingActivity(activity);
        setEditAmount(details.amount ? String(details.amount) : '');
        setEditDuration(details.duration ? String(details.duration) : '');
        setEditNotes(details.notes ? String(details.notes) : '');
    };

    const saveEdit = async () => {
        if (!user?.uid || !editingActivity) return;
        setSavingEdit(true);
        const details = { ...(editingActivity.details as Record<string, unknown>) };
        if ('amount' in details) details.amount = Number(editAmount) || 0;
        if ('duration' in details) details.duration = Number(editDuration) || 0;
        if ('notes' in details || editNotes) details.notes = editNotes;

        const updated = await firestore.updateActivity(user.uid, editingActivity.id, {
            details,
            timestamp: editingActivity.timestamp
        });
        if (updated) {
            setActivities((current) => current.map((activity) => (
                activity.id === editingActivity.id ? { ...activity, details } as Activity : activity
            )));
            setEditingActivity(null);
        } else {
            setError('オフライン記録は編集できないか、更新に失敗しました。');
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
                if (!cancelled) setError('アクティビティを読み込めませんでした。');
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
                最近の記録
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
                    inputProps={{ 'aria-label': '日付を選択' }}
                />
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedDate.toLocaleDateString('ja-JP', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
            </Typography>
            {ongoingSleep && (
                <Alert severity="info" sx={{ mb: 2, py: 0.25 }}>
                    睡眠中 · {Math.floor(elapsedSeconds / 3600)}時間 {Math.floor((elapsedSeconds % 3600) / 60)}分
                </Alert>
            )}
            <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 700 }}>サマリー</Typography>
                <Stack spacing={1}>
                    {[
                        { label: selectedDate.toLocaleDateString('ja-JP', { weekday: 'short', month: 'short', day: 'numeric' }), stats: todayStats },
                        { label: previousDate.toLocaleDateString('ja-JP', { weekday: 'short', month: 'short', day: 'numeric' }), stats: yesterdayStats }
                    ].map(({ label, stats }) => (
                        <Card key={label} variant="outlined" sx={{ borderRadius: 1.5 }}>
                            <CardContent sx={{ py: 1.25, '&:last-child': { pb: 1.25 } }}>
                                <Typography variant="body2" sx={{ color: '#6b7f8a', fontWeight: 700, mb: 0.75 }}>{label}</Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75 }}>
                                    <Box><Typography variant="caption" color="text.secondary">ミルク</Typography><Typography fontWeight={700}>{stats.feeding.count}回 · {stats.feeding.totalAmount}ml</Typography></Box>
                                    <Box><Typography variant="caption" color="text.secondary">離乳食</Typography><Typography fontWeight={700}>{stats.solid.count}回 · {stats.solid.totalAmount}g</Typography></Box>
                                    <Box><Typography variant="caption" color="text.secondary">おしっこ</Typography><Typography fontWeight={700}>{stats.urine.count}</Typography></Box>
                                    <Box><Typography variant="caption" color="text.secondary">うんち</Typography><Typography fontWeight={700}>{stats.stool.count}</Typography></Box>
                                </Box>
                            </CardContent>
                        </Card>
                    ))}
                </Stack>
            </Box>

            {loading && <CircularProgress size={28} />}
            {error && <Alert severity="error">{error}</Alert>}
            {!loading && !error && selectedActivities.length === 0 && (
                <Typography color="text.secondary">この日の記録はありません。</Typography>
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
                                                    {activityIcons[activity.type] || <EditNoteOutlinedIcon />}
                                                </Box>
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                                                        <Typography sx={{ fontSize: 15, fontWeight: 700, color }}>{activityLabels[activity.type] || activity.type}</Typography>
                                                        <Box sx={{ display: 'flex' }}>
                                                            <Tooltip title="記録を編集"><IconButton aria-label="記録を編集" size="small" onClick={() => openEdit(activity)}><EditNoteOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                                                            <Tooltip title="記録を削除"><IconButton aria-label="記録を削除" size="small" onClick={() => void handleDelete(activity.id)}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
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
                <DialogTitle>記録を編集</DialogTitle>
                <DialogContent>
                    {editingActivity?.type === 'feeding' && (
                        <TextField label="量 (ml)" type="number" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} fullWidth size="small" sx={{ mt: 1 }} />
                    )}
                    {editingActivity?.type === 'sleep' && (
                        <TextField label="時間 (分)" type="number" value={editDuration} onChange={(event) => setEditDuration(event.target.value)} fullWidth size="small" sx={{ mt: 1 }} />
                    )}
                    <TextField label="メモ" value={editNotes} onChange={(event) => setEditNotes(event.target.value)} fullWidth multiline minRows={2} size="small" sx={{ mt: 2 }} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingActivity(null)}>キャンセル</Button>
                    <Button variant="contained" onClick={() => void saveEdit()} disabled={savingEdit}>
                        {savingEdit ? <CircularProgress size={16} color="inherit" /> : '保存'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default TimelinePage;