// Simplified WHO Child Growth Standards (0-24 months)
// Source: WHO Multicentre Growth Reference Study Group

export interface GrowthStandard {
    month: number;
    n2sd: number; // -2 SD (approx 3rd percentile)
    median: number; // Median (50th percentile)
    p2sd: number; // +2 SD (approx 97th percentile)
}

export const WHO_WEIGHT_BOYS: GrowthStandard[] = [
    { month: 0, n2sd: 2.5, median: 3.3, p2sd: 4.4 },
    { month: 1, n2sd: 3.4, median: 4.5, p2sd: 5.8 },
    { month: 2, n2sd: 4.3, median: 5.6, p2sd: 7.1 },
    { month: 3, n2sd: 5.0, median: 6.4, p2sd: 8.0 },
    { month: 4, n2sd: 5.6, median: 7.0, p2sd: 8.7 },
    { month: 5, n2sd: 6.0, median: 7.5, p2sd: 9.3 },
    { month: 6, n2sd: 6.4, median: 7.9, p2sd: 9.8 },
    { month: 7, n2sd: 6.7, median: 8.3, p2sd: 10.3 },
    { month: 8, n2sd: 6.9, median: 8.6, p2sd: 10.7 },
    { month: 9, n2sd: 7.1, median: 8.9, p2sd: 11.0 },
    { month: 10, n2sd: 7.4, median: 9.2, p2sd: 11.4 },
    { month: 11, n2sd: 7.6, median: 9.4, p2sd: 11.7 },
    { month: 12, n2sd: 7.7, median: 9.6, p2sd: 12.0 },
    { month: 18, n2sd: 8.8, median: 10.9, p2sd: 13.7 },
    { month: 24, n2sd: 9.7, median: 12.2, p2sd: 15.3 },
];

export const WHO_WEIGHT_GIRLS: GrowthStandard[] = [
    { month: 0, n2sd: 2.4, median: 3.2, p2sd: 4.2 },
    { month: 1, n2sd: 3.2, median: 4.2, p2sd: 5.5 },
    { month: 2, n2sd: 3.9, median: 5.1, p2sd: 6.6 },
    { month: 3, n2sd: 4.5, median: 5.8, p2sd: 7.5 },
    { month: 4, n2sd: 5.0, median: 6.4, p2sd: 8.2 },
    { month: 5, n2sd: 5.4, median: 6.9, p2sd: 8.8 },
    { month: 6, n2sd: 5.7, median: 7.3, p2sd: 9.3 },
    { month: 7, n2sd: 6.0, median: 7.6, p2sd: 9.8 },
    { month: 8, n2sd: 6.3, median: 7.9, p2sd: 10.2 },
    { month: 9, n2sd: 6.5, median: 8.2, p2sd: 10.5 },
    { month: 10, n2sd: 6.7, median: 8.5, p2sd: 10.9 },
    { month: 11, n2sd: 6.9, median: 8.7, p2sd: 11.2 },
    { month: 12, n2sd: 7.0, median: 8.9, p2sd: 11.5 },
    { month: 18, n2sd: 8.1, median: 10.2, p2sd: 13.0 },
    { month: 24, n2sd: 9.0, median: 11.5, p2sd: 14.8 },
];

export const WHO_HEIGHT_BOYS: GrowthStandard[] = [
    { month: 0, n2sd: 46.1, median: 49.9, p2sd: 53.7 },
    { month: 1, n2sd: 50.8, median: 54.7, p2sd: 58.6 },
    { month: 2, n2sd: 54.4, median: 58.4, p2sd: 62.4 },
    { month: 3, n2sd: 57.3, median: 61.4, p2sd: 65.5 },
    { month: 4, n2sd: 59.7, median: 63.9, p2sd: 68.0 },
    { month: 5, n2sd: 61.7, median: 65.9, p2sd: 70.1 },
    { month: 6, n2sd: 63.3, median: 67.6, p2sd: 71.9 },
    { month: 7, n2sd: 64.8, median: 69.2, p2sd: 73.5 },
    { month: 8, n2sd: 66.2, median: 70.6, p2sd: 75.0 },
    { month: 9, n2sd: 67.5, median: 72.0, p2sd: 76.5 },
    { month: 10, n2sd: 68.7, median: 73.3, p2sd: 77.9 },
    { month: 11, n2sd: 69.9, median: 74.5, p2sd: 79.2 },
    { month: 12, n2sd: 71.0, median: 75.7, p2sd: 80.5 },
    { month: 18, n2sd: 76.9, median: 82.3, p2sd: 87.7 },
    { month: 24, n2sd: 81.0, median: 87.1, p2sd: 93.2 },
];

export const WHO_HEIGHT_GIRLS: GrowthStandard[] = [
    { month: 0, n2sd: 45.4, median: 49.1, p2sd: 52.9 },
    { month: 1, n2sd: 49.8, median: 53.7, p2sd: 57.6 },
    { month: 2, n2sd: 53.0, median: 57.1, p2sd: 61.1 },
    { month: 3, n2sd: 55.6, median: 59.8, p2sd: 64.0 },
    { month: 4, n2sd: 57.8, median: 62.1, p2sd: 66.4 },
    { month: 5, n2sd: 59.6, median: 64.0, p2sd: 68.5 },
    { month: 6, n2sd: 61.2, median: 65.7, p2sd: 70.3 },
    { month: 7, n2sd: 62.7, median: 67.3, p2sd: 71.9 },
    { month: 8, n2sd: 64.0, median: 68.7, p2sd: 73.5 },
    { month: 9, n2sd: 65.3, median: 70.1, p2sd: 75.0 },
    { month: 10, n2sd: 66.5, median: 71.5, p2sd: 76.4 },
    { month: 11, n2sd: 67.7, median: 72.8, p2sd: 77.8 },
    { month: 12, n2sd: 68.9, median: 74.0, p2sd: 79.2 },
    { month: 18, n2sd: 74.9, median: 80.7, p2sd: 86.5 },
    { month: 24, n2sd: 79.3, median: 85.7, p2sd: 92.2 },
];
