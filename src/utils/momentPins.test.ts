import { momentPins } from './momentPins';
import type { Moment, MomentPhoto } from '../firebase/moments';

const photo = (id: string, place: { lat: number; lng: number; name: string } | null = null): MomentPhoto =>
    ({ id, driveFileId: `d-${id}`, width: 1, height: 1, size: 1, place, takenAt: null });
const moment = (id: string, date: string, photos: MomentPhoto[], location: Moment['location'] = null): Moment =>
    ({ id, title: id, date, note: '', photos, driveFolderId: null, location, createdAt: `${date}T00:00:00Z`, updatedAt: '' });

const home = { lat: 35.5, lng: 139.65, name: 'Nhà' };
const hospital = { lat: 35.53, lng: 139.7, name: 'Bệnh viện' };

describe('momentPins', () => {
    it('puts each photo at its own place, falling back to the moment place', () => {
        const pins = momentPins([
            moment('a', '2025-06-14', [photo('1', home), photo('2', hospital), photo('3')], { ...home, source: 'photo' })
        ]);
        expect(pins.map((pin) => [pin.name, pin.photoCount, pin.cover?.id])).toEqual([['Nhà', 2, '1'], ['Bệnh viện', 1, '2']]);
    });

    it('merges moments at the same spot, newest first, and skips moments with no place', () => {
        const pins = momentPins([
            moment('old', '2025-01-01', [photo('o', home)]),
            moment('new', '2025-06-01', [photo('n', { ...home, lat: 35.5001 })]),
            moment('none', '2025-07-01', [photo('x')]),
            moment('noPhoto', '2025-02-01', [], { ...hospital, source: 'search' })
        ]);
        expect(pins.map((pin) => [pin.name, pin.entries.map((entry) => entry.moment.id), pin.cover?.id || null]))
            .toEqual([['Nhà', ['new', 'old'], 'n'], ['Bệnh viện', ['noPhoto'], null]]);
    });
});
