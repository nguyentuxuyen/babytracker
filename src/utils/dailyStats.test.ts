import { calculateStatsForDate } from './dailyStats';

describe('calculateStatsForDate', () => {
    const september4 = new Date(2026, 8, 4, 9, 0);
    const september5 = new Date(2026, 8, 5, 9, 0);

    it('only includes activities from the requested local date', () => {
        const activities = [
            { id: 'milk', type: 'feeding' as const, timestamp: september4, details: { amount: 120 } },
            { id: 'solid', type: 'feeding' as const, timestamp: september4, details: { amount: 50, foodType: 'solid' } },
            { id: 'diaper', type: 'diaper' as const, timestamp: september4, details: { isUrine: true, isStool: true } },
            { id: 'next-day', type: 'feeding' as const, timestamp: september5, details: { amount: 180 } }
        ];

        const stats = calculateStatsForDate(activities, september4);

        expect(stats.feeding).toEqual({ count: 1, totalAmount: 120 });
        expect(stats.solid).toEqual({ count: 1, totalAmount: 50 });
        expect(stats.urine.count).toBe(1);
        expect(stats.stool.count).toBe(1);
    });

    it('adds up fruit juice apart from milk', () => {
        const activities = [
            { id: 'milk', type: 'feeding' as const, timestamp: september4, details: { amount: 120 } },
            { id: 'j1', type: 'juice' as const, timestamp: september4, details: { fruit: 'Cam', amount: 30 } },
            { id: 'j2', type: 'juice' as const, timestamp: september4, details: { fruit: 'cam', amount: 20 } },
            { id: 'j3', type: 'juice' as const, timestamp: september4, details: { fruit: 'Táo', amount: 0 } }
        ];

        const stats = calculateStatsForDate(activities, september4);

        expect(stats.feeding).toEqual({ count: 1, totalAmount: 120 });
        expect(stats.juice).toEqual({ count: 3, totalAmount: 50, fruits: ['Cam', 'Táo'] });
    });
});
