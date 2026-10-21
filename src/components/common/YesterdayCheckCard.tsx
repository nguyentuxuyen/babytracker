import React, { useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { requestDailyInsight } from '../../services/assistantApi';
import {
    DailyTargetSettings,
    buildInsightSummary,
    ShortfallCheck,
    findShortfalls,
    getDailyTargets,
    latestWeightKg,
    loadTargetSettings,
    saveTargetSettings
} from '../../utils/dailyTargets';
import { ACTIVITY_COLORS, formatDuration } from './activityDisplay';
import { MilkIcon, SleepIcon } from './icons';
import { useNotificationEntry } from './NotificationCenter';

type YesterdayCheckCardProps = {
    activities: Array<{ type: string; timestamp: Date; details?: any }>;
    baby: { birthDate: Date; gender?: 'male' | 'female' };
    now: Date;
};

const DISMISSED_KEY = 'babytracker.yesterdayCheckDismissed';
// Last AI reading, kept for the day so reopening Home does not call the AI again.
const INSIGHT_KEY = 'babytracker.yesterdayInsight';

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const readInsight = (day: string) => {
    try {
        const saved = JSON.parse(window.localStorage.getItem(INSIGHT_KEY) || 'null');
        return saved && saved.day === day && typeof saved.text === 'string' ? saved.text as string : null;
    } catch {
        return null;
    }
};

const readDismissed = () => {
    try {
        return window.localStorage.getItem(DISMISSED_KEY);
    } catch {
        return null;
    }
};

// Gentle note in the header's notification list when yesterday's milk or sleep was below the baby's daily minimum.
const YesterdayCheckCard: React.FC<YesterdayCheckCardProps> = ({ activities, baby, now }) => {
    const { t, i18n } = useTranslation();
    const [settings, setSettings] = useState<DailyTargetSettings>(loadTargetSettings);
    const [dismissedDay, setDismissedDay] = useState(readDismissed);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ milk: '', sleep: '' });

    const today = dayKey(now);
    const [insight, setInsight] = useState<string | null>(() => readInsight(today));
    const [insightLoading, setInsightLoading] = useState(false);
    const [insightError, setInsightError] = useState('');
    const yesterday = useMemo(() => {
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        date.setHours(12, 0, 0, 0);
        return date;
    }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

    const shortfalls = useMemo(
        () => findShortfalls(activities, baby, yesterday, settings),
        [activities, baby, yesterday, settings]
    );
    // Reference values shown as placeholders when the parents edit their own minimums.
    const referenceTargets = useMemo(
        () => getDailyTargets(baby, yesterday, latestWeightKg(activities, new Date())),
        [activities, baby, yesterday]
    );

    const openSettings = () => {
        setDraft({
            milk: settings.milkMinMl ? String(settings.milkMinMl) : '',
            sleep: settings.sleepMinHours ? String(settings.sleepMinHours) : ''
        });
        setEditing(true);
    };

    const saveSettings = () => {
        const positive = (value: string) => (Number(value) > 0 ? Number(value) : null);
        const next = { milkMinMl: positive(draft.milk), sleepMinHours: positive(draft.sleep) };
        saveTargetSettings(next);
        setSettings(next);
        setEditing(false);
    };

    const analyze = async () => {
        setInsightLoading(true);
        setInsightError('');
        try {
            const text = await requestDailyInsight(buildInsightSummary(activities, baby, yesterday, settings), i18n.language);
            setInsight(text);
            try {
                window.localStorage.setItem(INSIGHT_KEY, JSON.stringify({ day: today, text }));
            } catch {
                // Not cached: the next visit asks again.
            }
        } catch (error) {
            setInsightError(error instanceof Error ? error.message : t('yesterdayCheck.aiFailed'));
        } finally {
            setInsightLoading(false);
        }
    };

    const dismiss = () => {
        try {
            window.localStorage.setItem(DISMISSED_KEY, today);
        } catch {
            // Storage unavailable: hide it for this visit only.
        }
        setDismissedDay(today);
    };

    const describe = (item: ShortfallCheck) => {
        if (item.kind === 'milk') {
            const { target } = item;
            return {
                color: ACTIVITY_COLORS.feeding,
                icon: <MilkIcon />,
                text: t('yesterdayCheck.milkLow', { total: `${item.totalMl}ml`, min: `${target.minMl}ml` }),
                basis: target.source === 'custom'
                    ? t('yesterdayCheck.basisCustom')
                    : target.source === 'weight'
                        ? t('yesterdayCheck.milkBasisWeight', { weight: target.weightKg })
                        : t('yesterdayCheck.milkBasisAge')
            };
        }
        const { target } = item;
        return {
            color: ACTIVITY_COLORS.sleep,
            icon: <SleepIcon />,
            text: t('yesterdayCheck.sleepLow', {
                total: formatDuration(item.totalMins),
                min: formatDuration(target.minHours * 60)
            }),
            basis: target.source === 'custom'
                ? t('yesterdayCheck.basisCustom')
                : t('yesterdayCheck.sleepBasisAge', { min: target.minHours, max: target.maxHours })
        };
    };

    const settingsDialog = (
        <Dialog open={editing} onClose={() => setEditing(false)} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '24px', m: 2, width: 'calc(100% - 32px)' } }}>
            <DialogTitle sx={{ fontWeight: 700, fontSize: 20, pb: 0.5 }}>{t('yesterdayCheck.settingsTitle')}</DialogTitle>
            <DialogContent sx={{ pt: '12px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography sx={{ fontSize: 13, color: '#6b7f8a' }}>{t('yesterdayCheck.settingsHint')}</Typography>
                <TextField
                    type="number"
                    label={t('yesterdayCheck.milkMinLabel')}
                    value={draft.milk}
                    onChange={(event) => setDraft((current) => ({ ...current, milk: event.target.value }))}
                    placeholder={referenceTargets.milk ? String(referenceTargets.milk.minMl) : ''}
                    helperText={referenceTargets.milk ? t('yesterdayCheck.referenceMilk', { min: referenceTargets.milk.minMl }) : t('yesterdayCheck.referenceMilkNone')}
                    inputProps={{ min: 0, step: 10, inputMode: 'numeric' }}
                    InputLabelProps={{ shrink: true }}
                />
                <TextField
                    type="number"
                    label={t('yesterdayCheck.sleepMinLabel')}
                    value={draft.sleep}
                    onChange={(event) => setDraft((current) => ({ ...current, sleep: event.target.value }))}
                    placeholder={String(referenceTargets.sleep.minHours)}
                    helperText={t('yesterdayCheck.referenceSleep', { min: referenceTargets.sleep.minHours, max: referenceTargets.sleep.maxHours })}
                    inputProps={{ min: 0, step: 0.5, inputMode: 'decimal' }}
                    InputLabelProps={{ shrink: true }}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
                <Button variant="contained" onClick={saveSettings}>{t('common.save')}</Button>
            </DialogActions>
        </Dialog>
    );

    const showing = shortfalls.length > 0 && dismissedDay !== today;
    useNotificationEntry('yesterdayCheck', {
        visible: showing,
        key: showing ? `yesterdayCheck:${today}:${shortfalls.map((item) => item.kind).join(',')}` : null
    });

    if (!showing) return settingsDialog;

    return (
        <>
            <Box sx={{ mb: 1.5, p: 1.5, borderRadius: '16px', bgcolor: '#fffbeb', border: '1px solid #fde68a' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#92400e' }}>{t('yesterdayCheck.title')}</Typography>
                    <IconButton size="small" onClick={dismiss} aria-label={t('yesterdayCheck.dismiss')} sx={{ color: '#92400e', mr: -0.5 }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {shortfalls.map((item) => {
                        const view = describe(item);
                        return (
                            <Box key={item.kind} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                                <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: view.color, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, '& svg': { fontSize: 15 } }}>
                                    {view.icon}
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{view.text}</Typography>
                                    <Typography sx={{ fontSize: 12, color: '#78716c' }}>{view.basis}</Typography>
                                </Box>
                            </Box>
                        );
                    })}
                </Box>
                {insight && (
                    <Box sx={{ mt: 1.25, p: 1.25, borderRadius: '12px', bgcolor: '#ffffff', border: '1px solid #fde68a' }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#92400e', mb: 0.5 }}>{t('yesterdayCheck.aiTitle')}</Typography>
                        <Typography sx={{ fontSize: 13, color: '#1e293b', whiteSpace: 'pre-line' }}>{insight}</Typography>
                    </Box>
                )}
                {insightError && <Typography sx={{ fontSize: 12, color: '#b91c1c', mt: 1 }}>{insightError}</Typography>}
                <Typography sx={{ fontSize: 11, color: '#a16207', mt: 1 }}>{t('yesterdayCheck.disclaimer')}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5, mt: 0.5, mb: -0.5 }}>
                    {!insight && (
                        <Button size="small" onClick={analyze} disabled={insightLoading} startIcon={insightLoading ? <CircularProgress size={14} color="inherit" /> : <AutoAwesomeIcon fontSize="small" />} sx={{ color: '#92400e', fontWeight: 700, textTransform: 'none' }}>
                            {insightLoading ? t('yesterdayCheck.aiLoading') : t('yesterdayCheck.aiAnalyze')}
                        </Button>
                    )}
                    <Button size="small" onClick={openSettings} sx={{ color: '#92400e', fontWeight: 700, textTransform: 'none' }}>
                        {t('yesterdayCheck.adjust')}
                    </Button>
                </Box>
            </Box>
            {settingsDialog}
        </>
    );
};

export default YesterdayCheckCard;
