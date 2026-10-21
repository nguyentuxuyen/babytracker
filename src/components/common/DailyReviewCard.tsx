import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import { DailyReview, fetchDailyReview } from '../../services/assistantApi';
import { loadTargetSettings } from '../../utils/dailyTargets';
import type { DayStatus } from '../../domain/dailyTargets.mjs';
import { ACTIVITY_COLORS, formatDuration } from './activityDisplay';
import { FoodIcon, MilkIcon, SleepIcon } from './icons';
import { useNotificationEntry } from './NotificationCenter';

type DailyReviewCardProps = {
    activities: Array<{ type: string; timestamp: Date }>;
    now: Date;
};

// Same hours as the server (api/_dailyReview.js): a sleep ending from 05:00 is the
// morning wake-up, and from 09:00 the review is written even without one.
const WAKE_FROM_HOUR = 5;
const FALLBACK_HOUR = 9;

const CACHE_KEY = 'babytracker.dailyReview';
const DISMISSED_KEY = 'babytracker.dailyReviewDismissed';
// Day of the last review shown as a popup on this device, so it pops up once.
const SEEN_KEY = 'babytracker.dailyReviewSeen';
// Tapping the morning push opens /activities?review=1 (api/_dailyReview.js).
export const REVIEW_QUERY = 'review';

const isoDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const readStorage = (key: string) => {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
};

const writeStorage = (key: string, value: string) => {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Storage unavailable: it lasts for this visit only.
    }
};

const readCached = (day: string): DailyReview | null => {
    try {
        const saved = JSON.parse(readStorage(CACHE_KEY) || 'null');
        return saved && saved.day === day && (saved.status === 'done' || saved.status === 'empty') ? saved : null;
    } catch {
        return null;
    }
};

// "2026-10-20" → weekday and date in the UI language, e.g. "Thứ Ba, 20/10/2026".
export const formatReviewDay = (day: string, language: string) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date).toLocaleDateString(language, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
};

const STATUS_STYLE: Record<DayStatus, { color: string; bg: string }> = {
    ok: { color: '#047857', bg: '#d1fae5' },
    low: { color: '#b45309', bg: '#fef3c7' },
    high: { color: '#1d4ed8', bg: '#dbeafe' },
    notLogged: { color: '#64748b', bg: '#f1f5f9' },
    notApplicable: { color: '#64748b', bg: '#f1f5f9' }
};

// AI review of yesterday (milk, solid food, sleep, what to improve): pops up once when it
// arrives, then stays in the header's notification list as a small row that reopens it.
const DailyReviewCard: React.FC<DailyReviewCardProps> = ({ activities, now }) => {
    const { t, i18n } = useTranslation();
    const yesterday = useMemo(() => {
        const date = new Date(now);
        date.setDate(date.getDate() - 1);
        return isoDay(date);
    }, [now]);
    const today = isoDay(now);

    const [review, setReview] = useState<DailyReview | null>(() => readCached(yesterday));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [dismissedDay, setDismissedDay] = useState(() => readStorage(DISMISSED_KEY));
    const askedFor = useRef<string | null>(null);
    const [open, setOpen] = useState(false);
    const history = useHistory();
    const location = useLocation();
    const fromPush = new URLSearchParams(location.search).has(REVIEW_QUERY);

    // The baby's first wake-up of the morning has been logged.
    const wokeUp = useMemo(() => {
        const from = new Date(now);
        from.setHours(WAKE_FROM_HOUR, 0, 0, 0);
        return activities.some((activity) => {
            const time = new Date(activity.timestamp).getTime();
            return activity.type === 'sleep' && time >= from.getTime() && time <= now.getTime();
        });
    }, [activities, now]);
    const autoGenerate = wokeUp || now.getHours() >= FALLBACK_HOUR;

    const load = useCallback(async (options: { generate: boolean; retryAi?: boolean }) => {
        setLoading(true);
        setError('');
        try {
            const result = await fetchDailyReview({ ...options, settings: loadTargetSettings(), language: i18n.language });
            setReview(result);
            if (result) writeStorage(CACHE_KEY, JSON.stringify(result));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('dailyReview.failed'));
        } finally {
            setLoading(false);
        }
    }, [i18n.language, t]);

    useEffect(() => {
        if (review?.day === yesterday) return;
        // Ask once for the stored review, and once more when it is time to write it.
        const step = `${yesterday}:${autoGenerate}`;
        if (askedFor.current === step) return;
        askedFor.current = step;
        load({ generate: autoGenerate });
    }, [yesterday, autoGenerate, review?.day, load]);

    const ready = review?.day === yesterday && review.status === 'done';
    useEffect(() => {
        if (ready && (fromPush || readStorage(SEEN_KEY) !== yesterday)) setOpen(true);
    }, [ready, fromPush, yesterday]);

    // In the header bell: counts as new once the review is written, and stays listed
    // until it is dismissed for the day.
    const markSeen = useNotificationEntry('dailyReview', {
        visible: dismissedDay !== today && !(review?.day === yesterday && review.status === 'empty'),
        key: ready ? `dailyReview:${yesterday}` : null
    });

    const closePopup = () => {
        setOpen(false);
        writeStorage(SEEN_KEY, yesterday);
        markSeen?.(`dailyReview:${yesterday}`);
        if (fromPush) history.replace(location.pathname);
    };

    if (dismissedDay === today && !open) return null;
    if (review?.day === yesterday && review.status === 'empty') return null;

    const dismiss = () => {
        writeStorage(DISMISSED_KEY, today);
        setDismissedDay(today);
    };

    const current = review?.day === yesterday && review.status === 'done' ? review : null;
    const facts = current?.facts;

    const rows = facts ? [
        {
            key: 'milk' as const,
            icon: <MilkIcon />,
            color: ACTIVITY_COLORS.feeding,
            value: facts.targets.milkMinMl
                ? t('dailyReview.amountOfTarget', { total: `${facts.yesterday.milkMl}ml`, target: `${facts.targets.milkMinMl}ml` })
                : `${facts.yesterday.milkMl}ml`,
            text: current?.ai?.milk
        },
        {
            key: 'solids' as const,
            icon: <FoodIcon />,
            color: ACTIVITY_COLORS.solid,
            value: facts.targets.solidMinMeals
                ? t('dailyReview.mealsOfTarget', { count: facts.yesterday.solidMeals, target: facts.targets.solidMinMeals })
                : '',
            text: current?.ai?.solids
        },
        {
            key: 'sleep' as const,
            icon: <SleepIcon />,
            color: ACTIVITY_COLORS.sleep,
            value: t('dailyReview.amountOfTarget', {
                total: formatDuration(facts.yesterday.sleepMinutes),
                target: formatDuration(facts.targets.sleepMinHours * 60)
            }),
            text: current?.ai?.sleep
        }
    ].filter((row) => facts.status[row.key] !== 'notApplicable') : [];

    const details = current && (
        <>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1e293b', mb: 1 }}>{current.headline}</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {rows.map((row) => {
                    const status = facts!.status[row.key];
                    const style = STATUS_STYLE[status];
                    return (
                        <Box key={row.key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                            <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: row.color, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, '& svg': { fontSize: 15 } }}>
                                {row.icon}
                            </Box>
                            <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                                    <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{t(`dailyReview.labels.${row.key}`)}</Typography>
                                    <Box component="span" sx={{ fontSize: 11, fontWeight: 700, px: 0.75, py: 0.1, borderRadius: '999px', color: style.color, bgcolor: style.bg }}>
                                        {t(`dailyReview.status.${status}`)}
                                    </Box>
                                    {row.value && <Typography sx={{ fontSize: 12, color: '#64748b' }}>{row.value}</Typography>}
                                </Box>
                                {row.text && <Typography sx={{ fontSize: 13, color: '#334155' }}>{row.text}</Typography>}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
            {current.ai && current.ai.tips.length > 0 && (
                <Box sx={{ mt: 1.25, p: 1.25, borderRadius: '12px', bgcolor: '#ffffff', border: '1px solid #ddd6fe' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', mb: 0.5 }}>{t('dailyReview.tipsTitle')}</Typography>
                    {current.ai.tips.map((tip) => (
                        <Typography key={tip} sx={{ fontSize: 13, color: '#1e293b' }}>• {tip}</Typography>
                    ))}
                </Box>
            )}
            {!current.ai && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
                    <Typography sx={{ fontSize: 12, color: '#64748b' }}>{t('dailyReview.aiUnavailable')}</Typography>
                    <Button size="small" onClick={() => load({ generate: true, retryAi: true })} disabled={loading} sx={{ color: '#5b21b6', fontWeight: 700, textTransform: 'none', flexShrink: 0 }}>
                        {loading ? <CircularProgress size={14} color="inherit" /> : t('dailyReview.retry')}
                    </Button>
                </Box>
            )}
            <Typography sx={{ fontSize: 11, color: '#7c3aed', mt: 1 }}>{t('yesterdayCheck.disclaimer')}</Typography>
        </>
    );

    const header = (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <AutoAwesomeIcon sx={{ fontSize: 18 }} />
                {t('dailyReview.titleFor', { date: formatReviewDay(yesterday, i18n.language) })}
            </Typography>
            <IconButton size="small" onClick={dismiss} aria-label={t('dailyReview.dismiss')} sx={{ color: '#5b21b6', mr: -0.5 }}>
                <CloseIcon fontSize="small" />
            </IconButton>
        </Box>
    );

    return (
        <>
            {dismissedDay !== today && (
                <Box sx={{ mb: 1.5, p: 1.5, borderRadius: '16px', bgcolor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                    {header}
                    {current ? (
                        <Box
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpen(true)}
                            onKeyDown={(event) => { if (event.key === 'Enter') setOpen(true); }}
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                        >
                            <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: '#1e293b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {current.headline}
                            </Typography>
                            <Button size="small" sx={{ color: '#5b21b6', fontWeight: 700, textTransform: 'none', flexShrink: 0 }}>
                                {t('dailyReview.open')}
                            </Button>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Typography sx={{ fontSize: 13, color: '#475569' }}>
                                {loading ? t('dailyReview.loading') : t('dailyReview.waiting')}
                            </Typography>
                            {!loading && (
                                <Button size="small" onClick={() => load({ generate: true })} sx={{ color: '#5b21b6', fontWeight: 700, textTransform: 'none', flexShrink: 0 }}>
                                    {t('dailyReview.generate')}
                                </Button>
                            )}
                            {loading && <CircularProgress size={16} sx={{ color: '#5b21b6' }} />}
                        </Box>
                    )}
                    {error && <Typography sx={{ fontSize: 12, color: '#b91c1c', mt: 1 }}>{error}</Typography>}
                </Box>
            )}
            <Dialog open={open && Boolean(current)} onClose={closePopup} fullWidth maxWidth="xs" PaperProps={{ sx: { borderRadius: '24px', m: 2, width: 'calc(100% - 32px)', bgcolor: '#faf9ff' } }}>
                <DialogTitle sx={{ pb: 0.5 }}>
                    <Typography component="span" sx={{ fontSize: 18, fontWeight: 700, color: '#5b21b6', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <AutoAwesomeIcon sx={{ fontSize: 20 }} />
                        {t('dailyReview.title')}
                    </Typography>
                    {current && <Typography component="span" sx={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#475569' }}>{formatReviewDay(current.day, i18n.language)}</Typography>}
                </DialogTitle>
                <DialogContent sx={{ pt: '8px !important' }}>
                    {details}
                    {error && <Typography sx={{ fontSize: 12, color: '#b91c1c', mt: 1 }}>{error}</Typography>}
                </DialogContent>
                <DialogActions>
                    <Button variant="contained" onClick={closePopup} sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, textTransform: 'none', fontWeight: 700, borderRadius: '12px' }}>
                        {t('dailyReview.gotIt')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default DailyReviewCard;
