import React from 'react';
import { Box, Button, CircularProgress, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { DailyReview } from '../../services/assistantApi';
import type { DayStatus } from '../../domain/dailyTargets.mjs';
import { ACTIVITY_COLORS, formatDuration } from './activityDisplay';
import { FoodIcon, MilkIcon, SleepIcon } from './icons';

export const STATUS_STYLE: Record<DayStatus, { color: string; bg: string }> = {
    ok: { color: '#047857', bg: '#d1fae5' },
    low: { color: '#b45309', bg: '#fef3c7' },
    high: { color: '#1d4ed8', bg: '#dbeafe' },
    notLogged: { color: '#64748b', bg: '#f1f5f9' },
    notApplicable: { color: '#64748b', bg: '#f1f5f9' }
};

type DailyReviewDetailsProps = {
    review: DailyReview;
    /** Shown as "Thử lại" when the AI part is missing. */
    onRetryAi?: () => void;
    loading?: boolean;
    /** Leave out the headline when the caller already shows it. */
    hideHeadline?: boolean;
};

// The written review of one day: milk, solid food and sleep against the targets, with the AI's
// words and tips. Used by the Home popup and the review history page.
const DailyReviewDetails: React.FC<DailyReviewDetailsProps> = ({ review, onRetryAi, loading = false, hideHeadline = false }) => {
    const { t } = useTranslation();
    const facts = review.facts;
    if (!facts) return null;

    const rows = [
        {
            key: 'milk' as const,
            icon: <MilkIcon />,
            color: ACTIVITY_COLORS.feeding,
            value: facts.targets.milkMinMl
                ? t('dailyReview.amountOfTarget', { total: `${facts.yesterday.milkMl}ml`, target: `${facts.targets.milkMinMl}ml` })
                : `${facts.yesterday.milkMl}ml`,
            // "Sữa mẹ 150ml · Sữa công thức (Meiji Hohoemi) 250ml" when the kinds were recorded.
            detail: (['breast', 'formula'] as const)
                .filter((kind) => facts.milkByType?.[kind])
                .map((kind) => `${t(`feeding.milkType.${kind}`)}${kind === 'formula' && facts.milkProduct ? ` (${facts.milkProduct})` : ''} ${facts.milkByType![kind]!.ml}ml`)
                .join(' · '),
            text: review.ai?.milk
        },
        {
            key: 'solids' as const,
            icon: <FoodIcon />,
            color: ACTIVITY_COLORS.solid,
            value: facts.targets.solidMinMeals
                ? t('dailyReview.mealsOfTarget', { count: facts.yesterday.solidMeals, target: facts.targets.solidMinMeals })
                : '',
            // "Cháo bí (mới) · Cà rốt ⚠" — the foods eaten, new ones and reactions marked.
            detail: (facts.solidFoods || [])
                .filter((food) => food.name !== '?')
                .map((food) => `${food.name}${food.newThisWeek ? ` (${t('dailyReview.newFood')})` : ''}${food.reaction === 'allergic' ? ' ⚠' : ''}`)
                .join(' · '),
            text: review.ai?.solids
        },
        {
            key: 'sleep' as const,
            icon: <SleepIcon />,
            color: ACTIVITY_COLORS.sleep,
            value: t('dailyReview.amountOfTarget', {
                total: formatDuration(facts.yesterday.sleepMinutes),
                target: formatDuration(facts.targets.sleepMinHours * 60)
            }),
            detail: '',
            text: review.ai?.sleep
        }
    ].filter((row) => facts.status[row.key] !== 'notApplicable');

    return (
        <>
            {!hideHeadline && <Typography sx={{ fontSize: 14, fontWeight: 600, color: '#1e293b', mb: 1 }}>{review.headline}</Typography>}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {rows.map((row) => {
                    const status = facts.status[row.key];
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
                                {row.detail && <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{row.detail}</Typography>}
                                {row.text && <Typography sx={{ fontSize: 13, color: '#334155' }}>{row.text}</Typography>}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
            {review.ai && review.ai.tips.length > 0 && (
                <Box sx={{ mt: 1.25, p: 1.25, borderRadius: '12px', bgcolor: '#ffffff', border: '1px solid #ddd6fe' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', mb: 0.5 }}>{t('dailyReview.tipsTitle')}</Typography>
                    {review.ai.tips.map((tip) => (
                        <Typography key={tip} sx={{ fontSize: 13, color: '#1e293b' }}>• {tip}</Typography>
                    ))}
                </Box>
            )}
            {!review.ai && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 1 }}>
                    <Typography sx={{ fontSize: 12, color: '#64748b' }}>{t('dailyReview.aiUnavailable')}</Typography>
                    {onRetryAi && (
                        <Button size="small" onClick={onRetryAi} disabled={loading} sx={{ color: '#5b21b6', fontWeight: 700, textTransform: 'none', flexShrink: 0 }}>
                            {loading ? <CircularProgress size={14} color="inherit" /> : t('dailyReview.retry')}
                        </Button>
                    )}
                </Box>
            )}
            <Typography sx={{ fontSize: 11, color: '#7c3aed', mt: 1 }}>{t('yesterdayCheck.disclaimer')}</Typography>
        </>
    );
};

export default DailyReviewDetails;
