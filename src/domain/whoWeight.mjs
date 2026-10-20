// WHO Child Growth Standards, weight-for-age in kg (0-24 months, simplified).
// Source: WHO Multicentre Growth Reference Study Group.
// Plain ES module so the app and the Vercel functions in api/ share it.
// Each row: { month, n2sd (-2 SD), median, p2sd (+2 SD) }.

export const WHO_WEIGHT_BOYS = [
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

export const WHO_WEIGHT_GIRLS = [
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
