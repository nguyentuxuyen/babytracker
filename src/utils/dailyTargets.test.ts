import { findShortfalls, getDailyTargets, latestWeightKg, loadTargetSettings, saveTargetSettings } from './dailyTargets';

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);
const milk = (day: number, hour: number, amount: number) => ({ type: 'feeding', timestamp: at(day, hour), details: { foodType: 'milk', amount } });
const sleep = (day: number, hour: number, duration: number) => ({ type: 'sleep', timestamp: at(day, hour), details: { duration } });
const weigh = (day: number, grams: number) => ({ type: 'measurement', timestamp: at(day, 8), details: { weight: grams } });

describe('getDailyTargets', () => {
    const yesterday = at(11, 12);

    it('uses 80% of 150 ml/kg for babies under 6 months with a measured weight', () => {
        const baby = { birthDate: new Date(2026, 6, 11), gender: 'male' as const };
        const targets = getDailyTargets(baby, yesterday, 5.5);
        expect(targets.milk).toEqual({ minMl: 660, source: 'weight', weightKg: 5.5 });
        expect(targets.sleep).toEqual({ minHours: 14, maxHours: 17, source: 'age' });
    });

    it('falls back to the WHO median weight when nothing was measured', () => {
        const baby = { birthDate: new Date(2026, 6, 11), gender: 'female' as const };
        const targets = getDailyTargets(baby, yesterday, null);
        expect(targets.milk?.source).toBe('age');
        // 3 months girl median ≈ 5.8 kg → 5.8 × 150 × 0.8 ≈ 696 → 690
        expect(targets.milk?.minMl).toBeGreaterThanOrEqual(650);
        expect(targets.milk?.minMl).toBeLessThanOrEqual(720);
    });

    it('caps the weight-based target at 960 ml a day', () => {
        const baby = { birthDate: new Date(2026, 4, 1) };
        expect(getDailyTargets(baby, yesterday, 9)?.milk?.minMl).toBe(760);
    });

    it('skips the milk check in the first two weeks', () => {
        const baby = { birthDate: new Date(2026, 9, 1) };
        expect(getDailyTargets(baby, yesterday, 3.4).milk).toBeNull();
    });

    it('uses age tables once solids start and for toddlers', () => {
        expect(getDailyTargets({ birthDate: new Date(2026, 2, 1) }, yesterday, 8).milk).toEqual({ minMl: 500, source: 'age' });
        expect(getDailyTargets({ birthDate: new Date(2025, 11, 1) }, yesterday, 9).milk).toEqual({ minMl: 400, source: 'age' });
        const toddler = getDailyTargets({ birthDate: new Date(2025, 3, 1) }, yesterday, 11);
        expect(toddler.milk).toEqual({ minMl: 300, source: 'age' });
        expect(toddler.sleep).toEqual({ minHours: 11, maxHours: 14, source: 'age' });
    });

    it('prefers the parents’ own minimums', () => {
        const targets = getDailyTargets({ birthDate: new Date(2026, 6, 11) }, yesterday, 5.5, { milkMinMl: 600, sleepMinHours: 13 });
        expect(targets.milk).toEqual({ minMl: 600, source: 'custom' });
        expect(targets.sleep).toEqual({ minHours: 13, source: 'custom' });
    });
});

describe('findShortfalls', () => {
    const baby = { birthDate: new Date(2026, 6, 11), gender: 'male' as const };
    const yesterday = at(11, 0);

    it('flags low milk and short sleep on that day only', () => {
        const activities = [
            weigh(1, 5500),
            milk(11, 6, 150), milk(11, 10, 150), milk(11, 14, 150),
            sleep(11, 6, 8 * 60), sleep(11, 15, 2 * 60),
            // Today's entries do not count for yesterday.
            milk(12, 6, 900), sleep(12, 6, 600)
        ];
        expect(findShortfalls(activities, baby, yesterday)).toEqual([
            { kind: 'milk', totalMl: 450, target: { minMl: 660, source: 'weight', weightKg: 5.5 } },
            { kind: 'sleep', totalMins: 600, target: { minHours: 14, maxHours: 17, source: 'age' } }
        ]);
    });

    it('stays quiet when the day meets the targets', () => {
        const activities = [
            weigh(1, 5500),
            ...[3, 6, 9, 12, 15, 18].map((hour) => milk(11, hour, 120)),
            sleep(11, 6, 10 * 60), sleep(11, 13, 2 * 60), sleep(11, 17, 2 * 60 + 30)
        ];
        expect(findShortfalls(activities, baby, yesterday)).toEqual([]);
    });

    it('does not warn about a type that was not logged at all', () => {
        expect(findShortfalls([sleep(11, 6, 15 * 60)], baby, yesterday)).toEqual([]);
        expect(findShortfalls([], baby, yesterday)).toEqual([]);
    });

    it('ignores weights measured after that day', () => {
        expect(latestWeightKg([weigh(1, 5000), weigh(12, 6000)], at(11, 23))).toBe(5);
    });
});

describe('target settings', () => {
    it('round-trips through localStorage and drops invalid values', () => {
        saveTargetSettings({ milkMinMl: 650, sleepMinHours: 13.5 });
        expect(loadTargetSettings()).toEqual({ milkMinMl: 650, sleepMinHours: 13.5 });

        localStorage.setItem('babytracker.dailyTargets', JSON.stringify({ milkMinMl: -1, sleepMinHours: 'x' }));
        expect(loadTargetSettings()).toEqual({ milkMinMl: null, sleepMinHours: null });

        localStorage.setItem('babytracker.dailyTargets', '{oops');
        expect(loadTargetSettings()).toEqual({ milkMinMl: null, sleepMinHours: null });
    });
});
