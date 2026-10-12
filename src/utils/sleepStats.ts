// Sleep calculations shared by Home (wake window) and Stats (sleep analysis).
// A sleep activity's `timestamp` is when the baby woke up; `details.duration` is in minutes.
interface SleepActivity {
    type: string;
    timestamp: Date;
    details?: any;
}

export type WakeWindowStatus = {
    level: 'sleepSoon' | 'overtired';
    hours: number;
    mins: number;
};

// From 2h awake the baby should sleep soon; from 2.5h the baby is overtired.
const SLEEP_SOON_HOURS = 2;
const OVERTIRED_HOURS = 2.5;

/**
 * Time awake since the most recent sleep ended, or null while it is still
 * inside the normal wake window (or there is no sleep to measure from).
 */
export function getWakeWindowStatus(activities: SleepActivity[], now: Date): WakeWindowStatus | null {
    const lastSleep = [...activities]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .find((a) => a.type === 'sleep');
    if (!lastSleep) return null;

    const diffMs = now.getTime() - new Date(lastSleep.timestamp).getTime();
    // A sleep logged in the future: nothing to warn about.
    if (diffMs < 0) return null;

    const diffHours = diffMs / (1000 * 60 * 60);
    if (diffHours < SLEEP_SOON_HOURS) return null;
    const hours = Math.floor(diffHours);
    const mins = Math.floor((diffHours - hours) * 60);
    return { level: diffHours >= OVERTIRED_HOURS ? 'overtired' : 'sleepSoon', hours, mins };
}

export type SleepAnalytics = {
    longestStretch: string;
    avgNightWakings: number;
    avgTotalSleep: string;
};

const dayMonthKey = (date: Date) => date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

const formatHm = (totalMins: number) => `${Math.floor(totalMins / 60)}h ${Math.floor(totalMins % 60)}m`;

/**
 * Sleep summary for the days shown on the Stats chart.
 * @param chartDates day keys of the chart ("DD/MM" as vi-VN formats them)
 * @param totalSleepMins sum of sleep minutes over those days
 */
export function calculateSleepAnalytics(
    activities: SleepActivity[],
    chartDates: string[],
    totalSleepMins: number
): SleepAnalytics {
    if (activities.length === 0 || chartDates.length === 0) {
        return { longestStretch: '0h', avgNightWakings: 0, avgTotalSleep: '0h 0m' };
    }

    const avgTotalSleep = formatHm(totalSleepMins / chartDates.length);
    const shownDates = new Set(chartDates);

    let longestStretchMins = 0;
    const nightSleepCounts = new Map<string, number>();

    activities.forEach((activity) => {
        if (activity.type !== 'sleep') return;

        const d = new Date(activity.timestamp);
        // A night sleep can end the morning after a shown day, so the previous day counts too.
        const prevDay = new Date(d);
        prevDay.setDate(prevDay.getDate() - 1);
        if (!shownDates.has(dayMonthKey(d)) && !shownDates.has(dayMonthKey(prevDay))) return;

        const duration = Number(activity.details?.duration || 0);
        if (duration > longestStretchMins) longestStretchMins = duration;

        // Night is 18:00–06:00; a sleep before 06:00 belongs to the previous day's night.
        const h = d.getHours();
        if (h >= 18 || h < 6) {
            const nightRef = new Date(d);
            if (h < 6) nightRef.setDate(nightRef.getDate() - 1);
            const key = dayMonthKey(nightRef);
            nightSleepCounts.set(key, (nightSleepCounts.get(key) || 0) + 1);
        }
    });

    // Three sleeps in one night means the baby woke twice in between.
    let totalWakings = 0;
    nightSleepCounts.forEach((count) => {
        if (count > 1) totalWakings += count - 1;
    });
    const nightCount = nightSleepCounts.size || 1;

    return {
        longestStretch: formatHm(longestStretchMins),
        avgNightWakings: Math.round((totalWakings / nightCount) * 10) / 10,
        avgTotalSleep
    };
}
