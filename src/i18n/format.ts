import i18n from './index';

// "2時間30分" / "2 h 30 min" / "2 giờ 30 phút"; drops a zero part.
export const formatHoursMinutes = (hours: number, minutes: number): string => {
    if (hours > 0 && minutes > 0) return i18n.t('units.hoursMinutes', { hours, minutes });
    if (hours > 0) return i18n.t('units.hours', { count: hours });
    return i18n.t('units.minutes', { count: minutes });
};
