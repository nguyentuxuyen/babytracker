import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Typography } from '@mui/material';
import { ACTIVITY_COLORS, isSolidFeeding } from './activityDisplay';

type BandActivity = { type: string; timestamp: Date | string; details?: any };

const DAY_MS = 24 * 60 * 60 * 1000;
const TICKS = [0, 6, 12, 18, 24];

/**
 * One day at a glance: sleeps as purple bars, milk and solid meals as dots and
 * diapers as small marks on a 24-hour line, so the day's rhythm is visible
 * without scrolling the list.
 */
const DayBand: React.FC<{
    date: Date;
    activities: BandActivity[];
    /** Start of a sleep still running, drawn up to now. */
    ongoingSleepStart?: Date | null;
    now?: Date;
}> = ({ date, activities, ongoingSleepStart, now = new Date() }) => {
    const { t } = useTranslation();
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const start = dayStart.getTime();
    const end = start + DAY_MS;
    const percent = (time: number) => `${((Math.min(Math.max(time, start), end) - start) / DAY_MS) * 100}%`;

    const sleeps: Array<{ from: number; to: number }> = [];
    activities.forEach((activity) => {
        if (activity.type !== 'sleep') return;
        const to = new Date(activity.timestamp).getTime();
        const from = to - Number(activity.details?.duration || 0) * 60000;
        if (to > start && from < end && to > from) sleeps.push({ from, to });
    });
    if (ongoingSleepStart) {
        const from = ongoingSleepStart.getTime();
        const to = now.getTime();
        if (to > start && from < end) sleeps.push({ from, to });
    }

    const points = activities
        .map((activity) => ({ activity, time: new Date(activity.timestamp).getTime() }))
        .filter(({ time }) => time >= start && time < end);
    const isToday = now.getTime() >= start && now.getTime() < end;

    return (
        <Box sx={{ bgcolor: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', px: 1.5, pt: 1.5, pb: 1, mb: 2 }}>
            <Box sx={{ position: 'relative', height: 36 }} aria-hidden>
                {/* Hour grid */}
                {TICKS.map((hour) => (
                    <Box key={hour} sx={{ position: 'absolute', left: `${(hour / 24) * 100}%`, top: 0, bottom: 0, width: '1px', bgcolor: '#eef1f4' }} />
                ))}
                {/* Sleeps */}
                {sleeps.map((sleep) => (
                    <Box
                        key={`${sleep.from}-${sleep.to}`}
                        sx={{
                            position: 'absolute',
                            top: 4,
                            height: 12,
                            left: percent(sleep.from),
                            width: `calc(${percent(sleep.to)} - ${percent(sleep.from)})`,
                            minWidth: 3,
                            borderRadius: '6px',
                            bgcolor: ACTIVITY_COLORS.sleep
                        }}
                    />
                ))}
                {/* Meals and diapers */}
                {points.map(({ activity, time }, index) => {
                    if (activity.type === 'feeding') {
                        const solid = isSolidFeeding(activity);
                        return (
                            <Box
                                key={index}
                                sx={{
                                    position: 'absolute',
                                    top: 21,
                                    left: percent(time),
                                    width: 9,
                                    height: 9,
                                    ml: '-4.5px',
                                    borderRadius: solid ? '2px' : '50%',
                                    bgcolor: solid ? ACTIVITY_COLORS.solid : ACTIVITY_COLORS.feeding,
                                    border: '1.5px solid #ffffff'
                                }}
                            />
                        );
                    }
                    if (activity.type === 'diaper') {
                        return (
                            <Box key={index} sx={{ position: 'absolute', top: 31, left: percent(time), width: 2, height: 5, ml: '-1px', borderRadius: 1, bgcolor: ACTIVITY_COLORS.diaper }} />
                        );
                    }
                    return null;
                })}
                {isToday && (
                    <Box sx={{ position: 'absolute', top: -2, bottom: -2, left: percent(now.getTime()), width: 2, ml: '-1px', bgcolor: '#ef4444', borderRadius: 1 }} />
                )}
            </Box>
            <Box sx={{ position: 'relative', height: 16, mt: 0.25 }}>
                {TICKS.map((hour) => (
                    <Typography
                        key={hour}
                        sx={{
                            position: 'absolute',
                            left: `${(hour / 24) * 100}%`,
                            transform: hour === 0 ? 'none' : hour === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#7d8b94',
                            fontVariantNumeric: 'tabular-nums'
                        }}
                    >
                        {hour}h
                    </Typography>
                ))}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.75 }}>
                {[
                    { color: ACTIVITY_COLORS.sleep, label: t('activityTypes.sleep'), shape: '6px', w: 14, h: 6 },
                    { color: ACTIVITY_COLORS.feeding, label: t('feeding.milk'), shape: '50%', w: 8, h: 8 },
                    { color: ACTIVITY_COLORS.solid, label: t('feeding.solid'), shape: '2px', w: 8, h: 8 },
                    { color: ACTIVITY_COLORS.diaper, label: t('activityTypes.diaper'), shape: '1px', w: 2, h: 8 }
                ].map((item) => (
                    <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Box sx={{ width: item.w, height: item.h, borderRadius: item.shape, bgcolor: item.color }} />
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: '#5b6b75' }}>{item.label}</Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};

export default DayBand;
