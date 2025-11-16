// Utility to calculate daily stats for a given date
interface Activity {
    id: string;
    type: 'feeding' | 'sleep' | 'diaper' | 'measurement' | 'memo' | 'bath';
    timestamp: Date;
    details: any;
}

interface Stats {
    feeding: { count: number; totalAmount: number };
    urine: { count: number };
    stool: { count: number };
    sleep: { count: number; totalDuration: number };
}

export function calculateStatsForDate(activities: Activity[], date: Date): Stats {
    const stats = {
        feeding: { count: 0, totalAmount: 0 },
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
                stats.feeding.count++;
                if (activity.details && activity.details.amount) stats.feeding.totalAmount += activity.details.amount;
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
