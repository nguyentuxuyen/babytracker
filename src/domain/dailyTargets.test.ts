import { assessDay, summarizeDay, targetsForAgeDays } from './dailyTargets.mjs';

const totals = (overrides: Partial<ReturnType<typeof summarizeDay>> = {}) => ({
    ...summarizeDay([]),
    ...overrides
});

describe('summarizeDay', () => {
    it('adds up milk, solid food, sleep and diapers', () => {
        const at = new Date(2026, 9, 20, 9);
        expect(summarizeDay([
            { type: 'feeding', timestamp: at, details: { foodType: 'milk', amount: 120 } },
            { type: 'feeding', timestamp: at, details: { foodType: 'milk', amount: '80' } },
            { type: 'feeding', timestamp: at, details: { foodType: 'solid', amount: 50 } },
            { type: 'sleep', timestamp: at, details: { duration: 90.4 } },
            { type: 'diaper', timestamp: at, details: { isUrine: true, isStool: true } },
            { type: 'memo', timestamp: at, details: { notes: 'x' } }
        ])).toEqual({ milkMl: 200, milkFeeds: 2, solidGrams: 50, solidMeals: 1, sleepMinutes: 90, sleeps: 1, wetDiapers: 1, stools: 1 });
    });
});

describe('targetsForAgeDays', () => {
    it('expects no solid food before 6 months, 2 meals from 6 and 3 from 9 months', () => {
        expect(targetsForAgeDays(150, 'male', 7).solids).toBeNull();
        expect(targetsForAgeDays(190, 'male', 8).solids).toEqual({ minMeals: 2 });
        expect(targetsForAgeDays(280, 'female', 9).solids).toEqual({ minMeals: 3 });
    });
});

describe('assessDay', () => {
    const targets = targetsForAgeDays(200, 'male', 8); // ~6.6 months: 500 ml, 2 meals, 12–16 h

    it('marks low, enough and more than the usual sleep', () => {
        expect(assessDay(totals({ milkFeeds: 4, milkMl: 400, solidMeals: 2, sleeps: 3, sleepMinutes: 17 * 60 }), targets))
            .toEqual({ milk: 'low', solids: 'ok', sleep: 'high' });
        expect(assessDay(totals({ milkFeeds: 5, milkMl: 600, solidMeals: 1, sleeps: 2, sleepMinutes: 11 * 60 }), targets))
            .toEqual({ milk: 'ok', solids: 'low', sleep: 'low' });
    });

    it('says "not logged" instead of "low" when nothing was recorded', () => {
        expect(assessDay(totals(), targets)).toEqual({ milk: 'notLogged', solids: 'notLogged', sleep: 'notLogged' });
    });

    it('skips checks that do not apply to the age', () => {
        const newborn = targetsForAgeDays(5, 'female', 3.3);
        expect(assessDay(totals(), newborn)).toMatchObject({ milk: 'notApplicable', solids: 'notApplicable' });
    });
});
