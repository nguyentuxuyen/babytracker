import React, { useMemo, useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import {
    DailyTargetSettings,
    ShortfallCheck,
    findShortfalls,
    getDailyTargets,
    latestWeightKg,
    loadTargetSettings,
    saveTargetSettings
} from '../../utils/dailyTargets';
import { ACTIVITY_COLORS, formatDuration } from './activityDisplay';
import { MilkIcon, SleepIcon } from './icons';

type YesterdayCheckCardProps = {
    activities: Array<{ type: string; timestamp: Date; details?: any }>;
    baby: { birthDate: Date; gender?: 'male' | 'female' };
    now: Date;
};

const DISMISSED_KEY = 'babytracker.yesterdayCheckDismissed';

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

const readDismissed = () => {
    try {
        return window.localStorage.getItem(DISMISSED_KEY);
    } catch {
        return null;
    }
};

// Gentle note on Home when yesterday's milk or sleep was below the baby's daily minimum.
const YesterdayCheckCard: React.FC<YesterdayCheckCardProps> = ({ activities, baby, now }) => {
    const { t } = useTranslation();
    const [settings, setSettings] = useState<DailyTargetSettings>(loadTargetSettings);
    const [dismissedDay, setDismissedDay] = useState(readDismissed);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState({ milk: '', sleep: '' });

    const today = dayKey(now);
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

    if (shortfalls.length === 0 || dismissedDay === today) return settingsDialog;

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
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
                    <Typography sx={{ fontSize: 11, color: '#a16207' }}>{t('yesterdayCheck.disclaimer')}</Typography>
                    <Button size="small" onClick={openSettings} sx={{ flexShrink: 0, color: '#92400e', fontWeight: 700, textTransform: 'none' }}>
                        {t('yesterdayCheck.adjust')}
                    </Button>
                </Box>
            </Box>
            {settingsDialog}
        </>
    );
};

export default YesterdayCheckCard;
