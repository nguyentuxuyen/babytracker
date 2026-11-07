import { groupPhotosByDay } from './photoImport';

const photo = (name: string, takenAt: string | null, gps: { lat: number; lng: number } | null = null, lastModified = 0) => ({
    file: new File(['x'], name, { lastModified }),
    meta: { takenAt, gps }
});

describe('groupPhotosByDay', () => {
    it('makes one group per capture day, newest day first, photos in time order', () => {
        const days = groupPhotosByDay([
            photo('b.jpg', '2026-11-05T15:00:00'),
            photo('old.jpg', '2026-10-20T09:00:00'),
            photo('a.jpg', '2026-11-05T09:30:00', { lat: 35.7, lng: 139.7 })
        ], 30);
        expect(days.map((day) => [day.date, day.photos.map((file) => file.name)])).toEqual([
            ['2026-11-05', ['a.jpg', 'b.jpg']],
            ['2026-10-20', ['old.jpg']]
        ]);
        expect(days[0].gps).toEqual({ lat: 35.7, lng: 139.7 });
        expect(days[1].gps).toBeNull();
        expect(days[0].fromFileDate).toBe(false);
    });

    it('caps photos per day and counts the rest', () => {
        const many = Array.from({ length: 5 }, (_, i) => photo(`${i}.jpg`, `2026-11-05T10:0${i}:00`));
        const [day] = groupPhotosByDay(many, 3);
        expect(day.photos.map((file) => file.name)).toEqual(['0.jpg', '1.jpg', '2.jpg']);
        expect(day.skipped).toBe(2);
    });

    it('falls back to the file date when a photo has no capture time', () => {
        const lastModified = new Date(2026, 9, 3, 12, 0).getTime();
        const [day] = groupPhotosByDay([photo('screenshot.png', null, null, lastModified)], 30);
        expect(day).toMatchObject({ date: '2026-10-03', fromFileDate: true });
    });
});
