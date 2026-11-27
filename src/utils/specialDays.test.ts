import { describe, expect, it } from 'vitest';
import { getSpecialDay } from './specialDays';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 8, 30);

describe('getSpecialDay', () => {
    const born = d(2025, 7, 23);

    it('celebrates the birth day of every month', () => {
        expect(getSpecialDay(born, d(2025, 8, 23))).toEqual({ kind: 'monthly', months: 1 });
        expect(getSpecialDay(born, d(2026, 11, 23))).toEqual({ kind: 'monthly', months: 16 });
    });

    it('celebrates the birthday each year', () => {
        expect(getSpecialDay(born, d(2026, 7, 23))).toEqual({ kind: 'birthday', years: 1 });
        expect(getSpecialDay(born, d(2027, 7, 23))).toEqual({ kind: 'birthday', years: 2 });
    });

    it('ignores other days, the day of birth and days before it', () => {
        expect(getSpecialDay(born, d(2026, 11, 22))).toBeNull();
        expect(getSpecialDay(born, d(2026, 11, 24))).toBeNull();
        expect(getSpecialDay(born, d(2025, 7, 23))).toBeNull();
        expect(getSpecialDay(born, d(2025, 6, 23))).toBeNull();
        expect(getSpecialDay(null, d(2026, 11, 23))).toBeNull();
        expect(getSpecialDay(new Date('nope'), d(2026, 11, 23))).toBeNull();
    });

    it('uses the last day of short months', () => {
        const lateBorn = d(2026, 1, 31);
        expect(getSpecialDay(lateBorn, d(2026, 2, 28))).toEqual({ kind: 'monthly', months: 1 });
        expect(getSpecialDay(lateBorn, d(2026, 4, 30))).toEqual({ kind: 'monthly', months: 3 });
        expect(getSpecialDay(lateBorn, d(2026, 4, 29))).toBeNull();
        expect(getSpecialDay(lateBorn, d(2026, 5, 31))).toEqual({ kind: 'monthly', months: 4 });
        expect(getSpecialDay(lateBorn, d(2026, 5, 30))).toBeNull();
    });

    it('celebrates a 29 February birthday on 28 February in other years', () => {
        const leap = d(2028, 2, 29);
        expect(getSpecialDay(leap, d(2029, 2, 28))).toEqual({ kind: 'birthday', years: 1 });
        expect(getSpecialDay(leap, d(2032, 2, 29))).toEqual({ kind: 'birthday', years: 4 });
        expect(getSpecialDay(leap, d(2032, 2, 28))).toBeNull();
    });
});
