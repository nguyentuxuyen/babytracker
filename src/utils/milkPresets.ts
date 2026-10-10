export const DEFAULT_MILK_AMOUNTS = [60, 90, 120, 150, 180];

type MilkLike = {
    type: string;
    timestamp: Date | string;
    details?: { foodType?: string; amount?: unknown } | null;
};

// Quick-pick milk amounts: the amounts used most in the last `days`, topped up
// with the defaults while there is too little history, sorted ascending.
export const suggestMilkAmounts = (
    activities: MilkLike[],
    { now = new Date(), days = 14, count = 5 }: { now?: Date; days?: number; count?: number } = {}
): number[] => {
    const since = now.getTime() - days * 24 * 60 * 60 * 1000;
    const uses = new Map<number, { times: number; last: number }>();
    for (const activity of activities) {
        if (activity.type !== 'feeding' || activity.details?.foodType === 'solid') continue;
        const amount = Math.round(Number(activity.details?.amount));
        const at = new Date(activity.timestamp).getTime();
        if (!(amount > 0) || !(at >= since)) continue;
        const entry = uses.get(amount);
        if (entry) {
            entry.times += 1;
            entry.last = Math.max(entry.last, at);
        } else {
            uses.set(amount, { times: 1, last: at });
        }
    }

    const frequent = Array.from(uses.entries())
        .sort((a, b) => b[1].times - a[1].times || b[1].last - a[1].last)
        .slice(0, count)
        .map(([amount]) => amount);
    const fillers = DEFAULT_MILK_AMOUNTS.filter((amount) => !frequent.includes(amount));
    return [...frequent, ...fillers].slice(0, count).sort((a, b) => a - b);
};
