// Quick picks for the fruit-juice form: amounts in ml and the fruits drunk lately.
export const JUICE_AMOUNTS = [30, 50, 60, 90, 120];

type JuiceLike = {
    type: string;
    timestamp: Date | string;
    details?: { fruit?: unknown } | null;
};

/**
 * Fruits for the chips: the ones logged lately (newest first, without duplicates,
 * case-insensitive), topped up with `defaults` while there is little history.
 */
export const suggestJuiceFruits = (activities: JuiceLike[], defaults: string[], count = 6): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    const add = (name: string) => {
        const clean = name.replace(/\s+/g, ' ').trim();
        const key = clean.toLocaleLowerCase();
        if (!clean || seen.has(key) || result.length >= count) return;
        seen.add(key);
        result.push(clean);
    };
    activities
        .filter((activity) => activity.type === 'juice' && typeof activity.details?.fruit === 'string')
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .forEach((activity) => add(String(activity.details?.fruit)));
    defaults.forEach(add);
    return result;
};
