// The baby's special days: each month on the day of birth ("tròn N tháng") and each year
// on the birthday ("sinh nhật N tuổi"). Months too short for the birth day (born on the
// 31st, or 29/2 in a non-leap year) celebrate on their last day instead.

export type SpecialDay =
    | { kind: 'birthday'; years: number }
    | { kind: 'monthly'; months: number };

const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

export const getSpecialDay = (birthDate: Date | null | undefined, today: Date): SpecialDay | null => {
    if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
    const months = (today.getFullYear() - birthDate.getFullYear()) * 12 + (today.getMonth() - birthDate.getMonth());
    if (months <= 0) return null;
    const celebrateOn = Math.min(birthDate.getDate(), daysInMonth(today.getFullYear(), today.getMonth()));
    if (today.getDate() !== celebrateOn) return null;
    return months % 12 === 0 ? { kind: 'birthday', years: months / 12 } : { kind: 'monthly', months };
};
