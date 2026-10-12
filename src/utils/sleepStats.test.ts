import { calculateSleepAnalytics, getWakeWindowStatus } from './sleepStats';

// Sleep timestamps are wake-up times; durations are minutes.
const sleep = (timestamp: Date, duration: number) => ({ type: 'sleep', timestamp, details: { duration } });
const milk = (timestamp: Date) => ({ type: 'feeding', timestamp, details: { amount: 120 } });
const dayKey = (date: Date) => date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

describe('getWakeWindowStatus', () => {
    const woke = new Date(2026, 9, 12, 9, 0);
    const after = (minutes: number) => new Date(woke.getTime() + minutes * 60 * 1000);

    it('stays quiet inside the normal wake window', () => {
        expect(getWakeWindowStatus([sleep(woke, 60)], after(119))).toBeNull();
    });

    it('says the baby should sleep soon from 2 hours awake', () => {
        expect(getWakeWindowStatus([sleep(woke, 60)], after(120))).toEqual({ level: 'sleepSoon', hours: 2, mins: 0 });
        expect(getWakeWindowStatus([sleep(woke, 60)], after(149))).toEqual({ level: 'sleepSoon', hours: 2, mins: 29 });
    });

    it('says the baby is overtired from 2.5 hours awake', () => {
        expect(getWakeWindowStatus([sleep(woke, 60)], after(150))).toEqual({ level: 'overtired', hours: 2, mins: 30 });
        expect(getWakeWindowStatus([sleep(woke, 60)], after(200))).toEqual({ level: 'overtired', hours: 3, mins: 20 });
    });

    it('measures from the most recent sleep, whatever the list order, and ignores feeds in between', () => {
        const earlier = sleep(new Date(2026, 9, 12, 5, 0), 120);
        const activities = [earlier, milk(after(30)), sleep(woke, 60), milk(after(90))];

        expect(getWakeWindowStatus(activities, after(100))).toBeNull();
        expect(getWakeWindowStatus([...activities].reverse(), after(130))?.level).toBe('sleepSoon');
    });

    it('returns null with no sleep or a sleep logged in the future', () => {
        expect(getWakeWindowStatus([milk(woke)], after(300))).toBeNull();
        expect(getWakeWindowStatus([sleep(after(60), 30)], woke)).toBeNull();
    });
});

describe('calculateSleepAnalytics', () => {
    const oct10 = new Date(2026, 9, 10);
    const oct11 = new Date(2026, 9, 11);
    const chartDates = [dayKey(oct10), dayKey(oct11)];
    const at = (day: Date, hour: number, minute = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

    it('returns zeros when there is nothing to show', () => {
        const empty = { longestStretch: '0h', avgNightWakings: 0, avgTotalSleep: '0h 0m' };
        expect(calculateSleepAnalytics([], chartDates, 0)).toEqual(empty);
        expect(calculateSleepAnalytics([sleep(at(oct10, 9), 60)], [], 60)).toEqual(empty);
    });

    it('averages total sleep per shown day', () => {
        expect(calculateSleepAnalytics([sleep(at(oct10, 9), 60)], chartDates, 25 * 60 + 30).avgTotalSleep).toBe('12h 45m');
    });

    it('finds the longest stretch among shown days, including a night that ended the next morning', () => {
        const activities = [
            sleep(at(oct10, 14), 90),
            sleep(at(new Date(2026, 9, 12), 5), 400), // night of Oct 11, ends on Oct 12
            sleep(at(new Date(2026, 9, 20), 5), 600) // outside the chart
        ];

        expect(calculateSleepAnalytics(activities, chartDates, 0).longestStretch).toBe('6h 40m');
    });

    it('counts night wakings as sleeps in the same night minus one, averaged per night', () => {
        const activities = [
            // Night of Oct 10: three sleeps (20:00, 23:30, and 04:00 on Oct 11) -> 2 wakings.
            sleep(at(oct10, 20), 60),
            sleep(at(oct10, 23, 30), 120),
            sleep(at(oct11, 4), 180),
            // Night of Oct 11: a single sleep -> 0 wakings.
            sleep(at(oct11, 21), 300),
            // Day naps never count as night wakings.
            sleep(at(oct11, 10), 45),
            sleep(at(oct11, 14), 45)
        ];

        expect(calculateSleepAnalytics(activities, chartDates, 0).avgNightWakings).toBe(1);
    });

    it('rounds the night-waking average to one decimal', () => {
        const oct9 = new Date(2026, 9, 9);
        const activities = [
            sleep(at(oct9, 20), 60), sleep(at(oct9, 22), 60), // 1 waking
            sleep(at(oct10, 20), 60), sleep(at(oct10, 22), 60), // 1 waking
            sleep(at(oct11, 20), 60) // 0 wakings
        ];

        expect(calculateSleepAnalytics(activities, [dayKey(oct9), ...chartDates], 0).avgNightWakings).toBe(0.7);
    });
});
