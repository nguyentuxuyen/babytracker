import React from 'react';
import i18n from '../../i18n';
import { formatHoursMinutes } from '../../i18n/format';
import { BabyIcon, BathIcon, FoodIcon, MeasurementIcon, MemoIcon, MilkIcon, SleepIcon } from './icons';

type DisplayActivity = {
    type: string;
    details?: unknown;
};

// One colour per activity type, shared by the home page, timeline and stats.
export const ACTIVITY_COLORS: Record<string, string> = {
    feeding: '#13a4ec',
    solid: '#ec4899',
    sleep: '#8b5cf6',
    diaper: '#f59e0b',
    measurement: '#10b981',
    memo: '#64748b',
    bath: '#06b6d4',
    dailyRating: '#ec4899'
};

const detailsOf = (activity: DisplayActivity) => (activity.details || {}) as Record<string, unknown>;

export const isSolidFeeding = (activity: DisplayActivity) => (
    activity.type === 'feeding' && detailsOf(activity).foodType === 'solid'
);

export const getActivityColor = (activity: DisplayActivity) => (
    isSolidFeeding(activity) ? ACTIVITY_COLORS.solid : ACTIVITY_COLORS[activity.type] || ACTIVITY_COLORS.feeding
);

export const getActivityIcon = (activity: DisplayActivity, props: { fontSize?: 'small' | 'medium' | 'inherit' } = {}) => {
    if (activity.type === 'feeding') return isSolidFeeding(activity) ? <FoodIcon {...props} /> : <MilkIcon {...props} />;
    if (activity.type === 'sleep') return <SleepIcon {...props} />;
    if (activity.type === 'diaper') return <BabyIcon {...props} />;
    if (activity.type === 'measurement') return <MeasurementIcon {...props} />;
    if (activity.type === 'bath') return <BathIcon {...props} />;
    return <MemoIcon {...props} />;
};

// "Sữa" / "Ăn dặm" for feedings, the activity type name for everything else.
export const getActivityLabel = (activity: DisplayActivity) => {
    if (activity.type === 'feeding') return i18n.t(isSolidFeeding(activity) ? 'feeding.solid' : 'feeding.milk');
    return i18n.t(`activityTypes.${activity.type}`, { defaultValue: activity.type });
};

export const formatDuration = (totalMinutes: number) => {
    const minutes = Math.max(0, Math.round(totalMinutes));
    return formatHoursMinutes(Math.floor(minutes / 60), minutes % 60);
};

export const getActivityDetails = (activity: DisplayActivity): string[] => {
    const details = detailsOf(activity);

    if (activity.type === 'feeding') {
        const amount = details.amount ? `${details.amount}${isSolidFeeding(activity) ? 'g' : 'ml'}` : '';
        const food = isSolidFeeding(activity) && details.foodItem ? String(details.foodItem) : '';
        return [food, amount].filter(Boolean);
    }
    if (activity.type === 'sleep') return details.duration ? [formatDuration(Number(details.duration))] : [];
    if (activity.type === 'measurement') {
        return [
            details.weight ? `${details.weight}g` : '',
            details.height ? `${details.height}cm` : '',
            details.temperature ? `${details.temperature}°C` : ''
        ].filter(Boolean);
    }
    if (activity.type === 'diaper') {
        return [details.isUrine ? i18n.t('diaper.urine') : '', details.isStool ? i18n.t('diaper.stool') : ''].filter(Boolean);
    }
    return details.notes ? [String(details.notes)] : [];
};

// Compact gap between two entries: "45m", "2h", "1h30".
export const formatGap = (minutes: number) => {
    const rounded = Math.max(1, Math.round(minutes));
    if (rounded < 60) return `${rounded}m`;
    const hours = Math.floor(rounded / 60);
    const rest = rounded % 60;
    return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`;
};
