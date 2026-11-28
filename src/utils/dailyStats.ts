// Utility to calculate daily stats for a given date
interface Activity {
    id: string;
    type: 'feeding' | 'juice' | 'sleep' | 'diaper' | 'measurement' | 'memo' | 'bath';
    timestamp: Date;
    details: any;
}

interface Stats {
    feeding: { count: number; totalAmount: number };
    solid: { count: number; totalAmount: number };
    /** Fruit juice: ml in total and the fruits, in the order first drunk that day. */
    juice: { count: number; totalAmount: number; fruits: string[] };
    urine: { count: number };
    stool: { count: number };
    sleep: { count: number; totalDuration: number };
}

export function calculateStatsForDate(activities: Activity[], date: Date): Stats {
    const stats = {
        feeding: { count: 0, totalAmount: 0 },
        solid: { count: 0, totalAmount: 0 },
        juice: { count: 0, totalAmount: 0, fruits: [] as string[] },
        urine: { count: 0 },
        stool: { count: 0 },
        sleep: { count: 0, totalDuration: 0 }
    };
    activities.forEach((activity: Activity) => {
        const actDate = new Date(activity.timestamp);
        if (
            actDate.getFullYear() === date.getFullYear() &&
            actDate.getMonth() === date.getMonth() &&
            actDate.getDate() === date.getDate()
        ) {
            if (activity.type === 'feeding') {
                if (activity.details?.foodType === 'solid') {
                    stats.solid.count++;
                    if (activity.details.amount) stats.solid.totalAmount += Number(activity.details.amount);
                } else {
                    stats.feeding.count++;
                    if (activity.details && activity.details.amount) stats.feeding.totalAmount += Number(activity.details.amount);
                }
            } else if (activity.type === 'juice') {
                stats.juice.count++;
                if (activity.details?.amount) stats.juice.totalAmount += Number(activity.details.amount);
                const fruit = String(activity.details?.fruit || '').trim();
                if (fruit && !stats.juice.fruits.some((name) => name.toLocaleLowerCase() === fruit.toLocaleLowerCase())) {
                    stats.juice.fruits.push(fruit);
                }
            } else if (activity.type === 'sleep') {
                stats.sleep.count++;
                if (activity.details && activity.details.duration) stats.sleep.totalDuration += activity.details.duration;
            } else if (activity.type === 'diaper') {
                if (activity.details && activity.details.isUrine) stats.urine.count++;
                if (activity.details && activity.details.isStool) stats.stool.count++;
            }
        }
    });
    return stats;
}
