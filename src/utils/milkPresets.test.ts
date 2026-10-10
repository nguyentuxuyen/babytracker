import { describe, expect, it } from 'vitest';
import { DEFAULT_MILK_AMOUNTS, suggestMilkAmounts } from './milkPresets';

const now = new Date('2026-10-10T12:00:00Z');
const milk = (amount: number, daysAgo: number, foodType = 'milk') => ({
    type: 'feeding',
    timestamp: new Date(now.getTime() - daysAgo * 86400000),
    details: { foodType, amount }
});

describe('suggestMilkAmounts', () => {
    it('falls back to the defaults without history', () => {
        expect(suggestMilkAmounts([], { now })).toEqual(DEFAULT_MILK_AMOUNTS);
    });

    it('puts the most used amounts first and tops up with defaults', () => {
        const activities = [milk(130, 0), milk(130, 1), milk(130, 2), milk(100, 1), milk(100, 3)];
        expect(suggestMilkAmounts(activities, { now })).toEqual([60, 90, 100, 120, 130]);
    });

    it('keeps only the five most used amounts', () => {
        const amounts = [70, 80, 100, 110, 130, 140];
        const activities = amounts.flatMap((amount, index) => Array.from({ length: 6 - index }, () => milk(amount, 1)));
        expect(suggestMilkAmounts(activities, { now })).toEqual([70, 80, 100, 110, 130]);
    });

    it('ignores solids, empty amounts and feedings older than two weeks', () => {
        const activities = [milk(40, 1, 'solid'), milk(0, 1), milk(200, 20), milk(110, 1)];
        expect(suggestMilkAmounts(activities, { now })).toEqual([60, 90, 110, 120, 150]);
    });
});
