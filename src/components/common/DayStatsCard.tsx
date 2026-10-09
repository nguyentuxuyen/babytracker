import React from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { calculateStatsForDate } from '../../utils/dailyStats';
import { ACTIVITY_COLORS, formatDuration } from './activityDisplay';
import { BabyIcon, FoodIcon, MilkIcon, SleepIcon } from './icons';

type DayStats = ReturnType<typeof calculateStatsForDate>;

type DayStatsCardProps = {
    title?: React.ReactNode;
    stats: DayStats;
    // When given, each tile also shows the previous day's value for comparison.
    previous?: DayStats;
    action?: React.ReactNode;
};

// Signed difference against the previous day, e.g. "+60ml" or "−1h20".
const formatChange = (diff: number, format: (value: number) => string) => {
    if (!diff) return '';
    return `${diff > 0 ? '+' : '−'}${format(Math.abs(diff))}`;
};

const Tile: React.FC<{
    color: string;
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    previous?: string;
    change?: string;
}> = ({ color, icon, label, value, sub, previous, change }) => {
    const { t } = useTranslation();
    return (
        <Box sx={{ p: 1.5, borderRadius: '16px', bgcolor: `${color}1f`, border: `1px solid ${color}40`, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box sx={{ width: 28, height: 28, borderRadius: '50%', bgcolor: color, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, '& svg': { fontSize: 16 } }}>
                    {icon}
                </Box>
                <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }} noWrap>{label}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#101c22', lineHeight: 1.2 }} noWrap>{value}</Typography>
                {change && (
                    <Typography component="span" sx={{ fontSize: 12, fontWeight: 700, color, bgcolor: '#ffffff', borderRadius: '999px', px: 0.75, flexShrink: 0 }}>
                        {change}
                    </Typography>
                )}
            </Box>
            {sub && <Typography sx={{ fontSize: 12, color: '#475569', mt: 0.25 }} noWrap>{sub}</Typography>}
            {previous !== undefined && (
                <Box sx={{ mt: 'auto', pt: 1 }}>
                    <Box sx={{ borderTop: `1px solid ${color}40`, pt: 0.75 }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{t('home.previousDay')}</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#334155' }} noWrap>{previous}</Typography>
                    </Box>
                </Box>
            )}
        </Box>
    );
};

const DayStatsCard: React.FC<DayStatsCardProps> = ({ title, stats, previous, action }) => {
    const { t } = useTranslation();
    const diaperValue = (value: DayStats) => t('home.diaperValue', { urine: value.urine.count, stool: value.stool.count });
    const sleepValue = (value: DayStats) => (value.sleep.totalDuration > 0 ? formatDuration(value.sleep.totalDuration) : '—');

    return (
        <Box sx={{ bgcolor: '#ffffff', borderRadius: '20px', border: '1px solid #e5e7eb', p: 2 }}>
            {(title || action) && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1 }}>
                    <Typography sx={{ fontSize: 17, fontWeight: 700, color: '#101c22' }}>{title}</Typography>
                    {action}
                </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
                <Tile
                    color={ACTIVITY_COLORS.feeding}
                    icon={<MilkIcon />}
                    label={t('feeding.milk')}
                    value={`${stats.feeding.totalAmount}ml`}
                    sub={t('units.times', { count: stats.feeding.count })}
                    previous={previous && `${previous.feeding.totalAmount}ml`}
                    change={previous && formatChange(stats.feeding.totalAmount - previous.feeding.totalAmount, (v) => `${v}ml`)}
                />
                <Tile
                    color={ACTIVITY_COLORS.sleep}
                    icon={<SleepIcon />}
                    label={t('activityTypes.sleep')}
                    value={sleepValue(stats)}
                    sub={t('units.times', { count: stats.sleep.count })}
                    previous={previous && sleepValue(previous)}
                    change={previous && formatChange(Math.round(stats.sleep.totalDuration - previous.sleep.totalDuration), formatDuration)}
                />
                <Tile
                    color={ACTIVITY_COLORS.diaper}
                    icon={<BabyIcon />}
                    label={t('activityTypes.diaper')}
                    value={diaperValue(stats)}
                    previous={previous && diaperValue(previous)}
                />
                <Tile
                    color={ACTIVITY_COLORS.solid}
                    icon={<FoodIcon />}
                    label={t('feeding.solid')}
                    value={`${stats.solid.totalAmount}g`}
                    sub={t('units.times', { count: stats.solid.count })}
                    previous={previous && `${previous.solid.totalAmount}g`}
                    change={previous && formatChange(stats.solid.totalAmount - previous.solid.totalAmount, (v) => `${v}g`)}
                />
            </Box>
        </Box>
    );
};

export default DayStatsCard;
