import { dateFromFileName, groupPhotosByDay, photoStamp, summarizeGroup } from './photoImport';

const NOW = new Date(2026, 10, 8, 20, 0).getTime();

const photo = (name: string, takenAt: string | null, gps: { lat: number; lng: number } | null = null, lastModified = NOW) => ({
    file: new File(['x'], name, { lastModified }),
    meta: { takenAt, gps }
});

describe('groupPhotosByDay', () => {
    it('makes one entry per capture day, newest day first, photos in time order', () => {
        const days = groupPhotosByDay([
            photo('b.jpg', '2026-11-05T15:00:00'),
            photo('old.jpg', '2026-10-20T09:00:00'),
            photo('a.jpg', '2026-11-05T09:30:00', { lat: 35.7, lng: 139.7 })
        ], NOW);
        expect(days.map((day) => [day.date, day.items.map((item) => item.file.name)])).toEqual([
            ['2026-11-05', ['a.jpg', 'b.jpg']],
            ['2026-10-20', ['old.jpg']]
        ]);
        expect(days[0].items[0].source).toBe('exif');
    });

    it('dates photos without EXIF by file name, then by an old file date, else leaves them undated', () => {
        const days = groupPhotosByDay([
            photo('IMG_20261103_101500.jpg', null),
            photo('screenshot.png', null, null, new Date(2026, 9, 3, 12, 0).getTime()),
            photo('download.jpg', null, null, NOW - 60 * 1000), // picked just now (iPhone)
            photo('a.jpg', '2026-11-05T09:30:00')
        ], NOW);
        expect(days.map((day) => [day.date, day.items.map((item) => item.source)])).toEqual([
            ['2026-11-05', ['exif']],
            ['2026-11-03', ['name']],
            ['2026-10-03', ['file']],
            ['', ['none']]
        ]);
    });
});

describe('dateFromFileName', () => {
    it('reads common camera and app names', () => {
        expect(dateFromFileName('IMG_20261105_143022.jpg')).toBe('2026-11-05T14:30:22');
        expect(dateFromFileName('PXL_20261105_143022123.jpg')).toBe('2026-11-05T14:30:22');
        expect(dateFromFileName('Screenshot_2026-11-05-14-30-22.png')).toBe('2026-11-05T14:30:22');
        expect(dateFromFileName('IMG-20261105-WA0001.jpg')).toBe('2026-11-05T12:00:00');
    });

    it('ignores names without a real date', () => {
        expect(dateFromFileName('IMG_4521.HEIC')).toBeNull();
        expect(dateFromFileName('photo_20261345.jpg')).toBeNull();
        expect(dateFromFileName('9920261105.jpg')).toBeNull();
    });
});

describe('photoStamp', () => {
    it('prefers EXIF', () => {
        expect(photoStamp(photo('IMG_20200101_000000.jpg', '2026-11-05T09:30:00'), NOW)).toEqual({ stamp: '2026-11-05T09:30:00', source: 'exif' });
    });
});

describe('summarizeGroup', () => {
    it('merges days into one event dated by its first day, with the range and caps', () => {
        const days = groupPhotosByDay([
            photo('d1.jpg', '2026-11-03T10:00:00'),
            photo('d2.jpg', '2026-11-04T10:00:00', { lat: 1, lng: 2 }),
            photo('d2b.jpg', '2026-11-04T11:00:00'),
            photo('IMG_20261102_090000.jpg', null),
            photo('nodate.jpg', null)
        ], NOW);
        const summary = summarizeGroup(days, 4);
        expect(summary).toMatchObject({ date: '2026-11-02', endDate: '2026-11-04', skipped: 1, guessed: 1, undated: 1, gps: { lat: 1, lng: 2 } });
        expect(summary.photos.map((file) => file.name)).toEqual(['IMG_20261102_090000.jpg', 'd1.jpg', 'd2.jpg', 'd2b.jpg']);
    });

    it('has no date when only undated photos are in it', () => {
        const days = groupPhotosByDay([photo('a.jpg', null), photo('b.jpg', null)], NOW);
        expect(summarizeGroup(days, 30)).toMatchObject({ date: '', endDate: '', undated: 2, skipped: 0 });
    });
});

describe('places within a day', () => {
    const home = { lat: 35.5, lng: 139.65 };
    const park = { lat: 35.7151, lng: 139.7715 };
    it('splits a day where the place changes; photos without GPS stay with their part', () => {
        const days = groupPhotosByDay([
            photo('h1.jpg', '2026-11-05T08:00:00', home),
            photo('h2.jpg', '2026-11-05T08:30:00', { lat: 35.501, lng: 139.651 }),
            photo('p1.jpg', '2026-11-05T11:00:00', park),
            photo('p2.jpg', '2026-11-05T11:30:00'),
            photo('h3.jpg', '2026-11-05T18:00:00', home)
        ], NOW);
        expect(days.map((day) => [day.id, day.items.map((item) => item.file.name)])).toEqual([
            ['2026-11-05', ['h1.jpg', 'h2.jpg']],
            ['2026-11-05#2', ['p1.jpg', 'p2.jpg']],
            ['2026-11-05#3', ['h3.jpg']]
        ]);
        expect(days[1].gps).toEqual(park);
        const merged = summarizeGroup(days.slice(0, 2), 30);
        expect(merged.items.map((item) => item.gps)).toEqual([home, { lat: 35.501, lng: 139.651 }, park, null]);
    });

    it('keeps undated photos of the same place together', () => {
        const days = groupPhotosByDay([photo('a.jpg', null, home), photo('b.jpg', null, park), photo('c.jpg', null, home)], NOW);
        expect(days.map((day) => [day.id, day.items.length])).toEqual([['none', 2], ['none#2', 1]]);
    });
});
