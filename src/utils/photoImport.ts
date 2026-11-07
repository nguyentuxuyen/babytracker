// Bulk import: many photos become one moment per day they were taken.
import { GpsPoint, PhotoMeta } from './photoExif';

export interface ImportPhoto {
    file: File;
    meta: PhotoMeta;
}

export interface ImportDay {
    date: string; // YYYY-MM-DD
    photos: File[]; // oldest first, at most `maxPerDay`
    skipped: number; // photos beyond `maxPerDay`
    gps: GpsPoint | null; // first photo of the day with a position
    /** True when no photo of the day had a capture time and the file date was used. */
    fromFileDate: boolean;
}

const pad = (value: number) => String(value).padStart(2, '0');
const localStamp = (time: number) => {
    const date = new Date(time);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** Newest day first; within a day photos in the order they were taken. */
export const groupPhotosByDay = (photos: ImportPhoto[], maxPerDay: number): ImportDay[] => {
    const byDay = new Map<string, Array<{ file: File; stamp: string; gps: GpsPoint | null; exif: boolean }>>();
    photos.forEach(({ file, meta }) => {
        // Without EXIF the file's own date is the best guess (often the capture day on Android).
        const stamp = meta.takenAt || localStamp(file.lastModified || Date.now());
        const day = stamp.slice(0, 10);
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push({ file, stamp, gps: meta.gps, exif: Boolean(meta.takenAt) });
    });
    return [...byDay.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, items]) => {
            const sorted = [...items].sort((a, b) => a.stamp.localeCompare(b.stamp));
            return {
                date,
                photos: sorted.slice(0, maxPerDay).map((item) => item.file),
                skipped: Math.max(0, sorted.length - maxPerDay),
                gps: sorted.find((item) => item.gps)?.gps || null,
                fromFileDate: !sorted.some((item) => item.exif)
            };
        });
};
