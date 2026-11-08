// Bulk import: many photos are split by the day they were taken; days can then be merged
// into one event (see summarizeGroup).
import { GpsPoint, PhotoMeta } from './photoExif';
import { samePlace } from './geo';

export interface ImportPhoto {
    file: File;
    meta: PhotoMeta;
}

/** Where a photo's date came from: EXIF, its file name, its file date, or nowhere. */
export type DateSource = 'exif' | 'name' | 'file' | 'none';

export interface ImportItem {
    file: File;
    stamp: string; // "YYYY-MM-DDTHH:MM:SS", '' when unknown
    gps: GpsPoint | null;
    source: DateSource;
}

export interface ImportDay {
    /** Unique within one import: the date, plus "#2", "#3"… for later places that day. */
    id: string;
    date: string; // YYYY-MM-DD, or UNKNOWN_DAY for photos without any date
    items: ImportItem[]; // in the order they were taken
    gps: GpsPoint | null; // where this part of the day was, from its first photo with GPS
}

export const UNKNOWN_DAY = '';

// A file date this close to the import is the time it was picked (iPhone), not taken.
const FRESH_FILE_MS = 15 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');
const localStamp = (time: number) => {
    const date = new Date(time);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/**
 * Capture time written in a file name, as cameras and apps do:
 * IMG_20261105_143022.jpg, PXL_20261105_143022123.jpg, Screenshot_2026-11-05-14-30-22.png,
 * IMG-20261105-WA0001.jpg (date only).
 */
export const dateFromFileName = (name: string): string | null => {
    const match = /(?:^|\D)(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?:[-_ T.]?(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2}))?/.exec(name);
    if (!match) return null;
    const [, y, mo, d, h = '12', mi = '00', s = '00'] = match;
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return `${y}-${mo}-${d}T12:00:00`;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
};

export const photoStamp = ({ file, meta }: ImportPhoto, now = Date.now()): { stamp: string; source: DateSource } => {
    if (meta.takenAt) return { stamp: meta.takenAt, source: 'exif' };
    const fromName = dateFromFileName(file.name);
    if (fromName) return { stamp: fromName, source: 'name' };
    if (file.lastModified && Math.abs(now - file.lastModified) > FRESH_FILE_MS) {
        return { stamp: localStamp(file.lastModified), source: 'file' };
    }
    return { stamp: '', source: 'none' };
};

// Within a day, photos are split where the place changes (more than SAME_PLACE_KM away
// from where that part started). Photos without GPS stay with the part they are taken in.
const splitByPlace = (date: string, items: ImportItem[]): ImportDay[] => {
    const parts: ImportDay[] = [];
    items.forEach((item) => {
        const last = parts[parts.length - 1];
        if (last && !(item.gps && last.gps && !samePlace(item.gps, last.gps))) {
            last.items.push(item);
            if (!last.gps && item.gps) last.gps = item.gps;
            return;
        }
        // Undated photos have no order, so going back to an earlier place joins that part.
        const earlier = date === UNKNOWN_DAY && item.gps ? parts.find((part) => part.gps && samePlace(part.gps, item.gps!)) : undefined;
        if (earlier) { earlier.items.push(item); return; }
        parts.push({ id: parts.length ? `${date || 'none'}#${parts.length + 1}` : date || 'none', date, items: [item], gps: item.gps });
    });
    return parts;
};

/** One entry per capture day and place, newest day first; photos without a date come last. */
export const groupPhotosByDay = (photos: ImportPhoto[], now = Date.now()): ImportDay[] => {
    const byDay = new Map<string, ImportItem[]>();
    photos.forEach((photo) => {
        const { stamp, source } = photoStamp(photo, now);
        const day = stamp ? stamp.slice(0, 10) : UNKNOWN_DAY;
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day)!.push({ file: photo.file, stamp, gps: photo.meta.gps, source });
    });
    return [...byDay.entries()]
        .sort(([a], [b]) => (a === UNKNOWN_DAY ? 1 : b === UNKNOWN_DAY ? -1 : b.localeCompare(a)))
        .flatMap(([date, items]) => splitByPlace(date, [...items].sort((a, b) => a.stamp.localeCompare(b.stamp))));
};

export interface ImportGroupSummary {
    /** Earliest known day ('' when no photo has a date): the event's date. */
    date: string;
    /** Latest known day, for showing a range. */
    endDate: string;
    photos: File[]; // in time order, at most `max`; undated photos last
    items: ImportItem[]; // the same photos with their time and GPS
    skipped: number; // photos beyond `max`
    gps: GpsPoint | null; // first photo with a position
    guessed: number; // photos dated from their file name or file date
    undated: number; // photos without any date
}

/** What one event made of these days would hold. */
export const summarizeGroup = (days: ImportDay[], max: number): ImportGroupSummary => {
    const dated = days.filter((day) => day.date !== UNKNOWN_DAY).map((day) => day.date).sort();
    const items = days.flatMap((day) => day.items)
        .sort((a, b) => (a.stamp ? (b.stamp ? a.stamp.localeCompare(b.stamp) : -1) : b.stamp ? 1 : 0));
    return {
        date: dated[0] || '',
        endDate: dated[dated.length - 1] || '',
        photos: items.slice(0, max).map((item) => item.file),
        items: items.slice(0, max),
        skipped: Math.max(0, items.length - max),
        gps: items.find((item) => item.gps)?.gps || null,
        guessed: items.filter((item) => item.source === 'name' || item.source === 'file').length,
        undated: items.filter((item) => item.source === 'none').length
    };
};
