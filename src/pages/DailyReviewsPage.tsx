import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useTranslation } from 'react-i18next';
import { DailyReview, fetchDailyReview, fetchDailyReviewHistory } from '../services/assistantApi';
import { loadTargetSettings } from '../utils/dailyTargets';
import DailyReviewDetails, { STATUS_STYLE } from '../components/common/DailyReviewDetails';
import { formatReviewDay } from '../components/common/DailyReviewCard';

const isoDay = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// Every written morning review, newest first; a day can be written again from the current log.
const DailyReviewsPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [reviews, setReviews] = useState<DailyReview[] | null>(null);
    const [error, setError] = useState('');
    const [expanded, setExpanded] = useState<string | null>(null);
    // The day being written, or "yesterday" for a review not written yet.
    const [busyDay, setBusyDay] = useState<string | null>(null);
    const [dayError, setDayError] = useState<{ day: string; message: string } | null>(null);

    const yesterday = (() => {
        const date = new Date();
        date.setDate(date.getDate() - 1);
        return isoDay(date);
    })();

    const loadHistory = useCallback(async () => {
        setError('');
        try {
            const list = await fetchDailyReviewHistory();
            setReviews(list);
            setExpanded((current) => current ?? list[0]?.day ?? null);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : t('dailyReview.failed'));
            setReviews((current) => current ?? []);
        }
    }, [t]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const write = async (day: string, rewrite: boolean) => {
        setBusyDay(day);
        setDayError(null);
        try {
            const review = await fetchDailyReview({
                generate: true,
                ...(rewrite ? { rewriteDay: day } : {}),
                settings: loadTargetSettings(),
                language: i18n.language
            });
            if (review && review.status === 'done') {
                setReviews((current) => [review, ...(current || []).filter((item) => item.day !== review.day)]
                    .sort((a, b) => (a.day < b.day ? 1 : -1)));
                setExpanded(review.day);
            } else if (review && review.status === 'empty') {
                setDayError({ day, message: t('dailyReview.nothingLogged') });
            }
        } catch (writeError) {
            setDayError({ day, message: writeError instanceof Error ? writeError.message : t('dailyReview.failed') });
        } finally {
            setBusyDay(null);
        }
    };

    const hasYesterday = (reviews || []).some((review) => review.day === yesterday);

    return (
        <Box sx={{ px: 2, pt: 2, maxWidth: 720, mx: 'auto' }}>
            <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#101c22', display: 'flex', alignItems: 'center', gap: 1 }}>
                <AutoAwesomeIcon sx={{ color: '#7c3aed' }} />
                {t('dailyReview.historyTitle')}
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#64748b', mb: 2 }}>{t('dailyReview.historyHint')}</Typography>

            {reviews && !hasYesterday && (
                <Box sx={{ mb: 1.5, p: 1.5, borderRadius: '16px', bgcolor: '#f5f3ff', border: '1px dashed #c4b5fd', display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ flex: 1, fontSize: 14, color: '#475569' }}>
                        {t('dailyReview.titleFor', { date: formatReviewDay(yesterday, i18n.language) })}
                        {dayError?.day === yesterday && (
                            <Box component="span" sx={{ display: 'block', fontSize: 12, color: '#b91c1c' }}>{dayError.message}</Box>
                        )}
                    </Typography>
                    <Button
                        size="small"
                        onClick={() => write(yesterday, false)}
                        disabled={busyDay !== null}
                        sx={{ color: '#5b21b6', fontWeight: 700, textTransform: 'none', flexShrink: 0 }}
                    >
                        {busyDay === yesterday ? <CircularProgress size={14} color="inherit" /> : t('dailyReview.generate')}
                    </Button>
                </Box>
            )}

            {reviews === null && (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                    <CircularProgress size={24} sx={{ color: '#7c3aed' }} />
                </Box>
            )}
            {error && <Typography sx={{ fontSize: 13, color: '#b91c1c', mb: 1.5 }}>{error}</Typography>}
            {reviews && reviews.length === 0 && !error && (
                <Typography sx={{ fontSize: 14, color: '#64748b', py: 2 }}>{t('dailyReview.historyEmpty')}</Typography>
            )}

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pb: 2 }}>
                {(reviews || []).map((review) => {
                    const open = expanded === review.day;
                    const statuses = review.facts
                        ? (['milk', 'solids', 'sleep'] as const).filter((key) => review.facts!.status[key] !== 'notApplicable')
                        : [];
                    return (
                        <Box key={review.day} sx={{ p: 1.5, borderRadius: '16px', bgcolor: open ? '#faf9ff' : '#ffffff', border: `1px solid ${open ? '#ddd6fe' : '#e5e7eb'}` }}>
                            <Box
                                role="button"
                                tabIndex={0}
                                aria-expanded={open}
                                onClick={() => setExpanded(open ? null : review.day)}
                                onKeyDown={(event) => { if (event.key === 'Enter') setExpanded(open ? null : review.day); }}
                                sx={{ cursor: 'pointer' }}
                            >
                                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#5b21b6', textTransform: 'capitalize' }}>
                                    {formatReviewDay(review.day, i18n.language)}
                                </Typography>
                                <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1e293b', mt: 0.25 }}>{review.headline}</Typography>
                                {!open && statuses.length > 0 && (
                                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                                        {statuses.map((key) => {
                                            const status = review.facts!.status[key];
                                            return (
                                                <Box key={key} component="span" sx={{ fontSize: 11, fontWeight: 700, px: 0.75, py: 0.1, borderRadius: '999px', color: STATUS_STYLE[status].color, bgcolor: STATUS_STYLE[status].bg }}>
                                                    {t(`dailyReview.labels.${key}`)}: {t(`dailyReview.status.${status}`)}
                                                </Box>
                                            );
                                        })}
                                    </Box>
                                )}
                            </Box>
                            {open && (
                                <Box sx={{ mt: 1 }}>
                                    <DailyReviewDetails review={review} hideHeadline />
                                    {dayError?.day === review.day && (
                                        <Typography sx={{ fontSize: 12, color: '#b91c1c', mt: 1 }}>{dayError.message}</Typography>
                                    )}
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            onClick={() => write(review.day, true)}
                                            disabled={busyDay !== null}
                                            sx={{ color: '#5b21b6', borderColor: '#c4b5fd', fontWeight: 700, textTransform: 'none', borderRadius: '10px' }}
                                        >
                                            {busyDay === review.day ? <CircularProgress size={14} color="inherit" /> : t('dailyReview.rewrite')}
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
};

export default DailyReviewsPage;
