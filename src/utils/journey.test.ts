import { along, easeInOut, journeyStops, legDuration } from './journey';
import type { MomentPhoto } from '../firebase/moments';

const A = { lat: 34.6, lng: 135.0, name: 'Cầu Akashi' };
const B = { lat: 34.45, lng: 134.9, name: 'Awaji' };
const C = { lat: 34.25, lng: 134.7, name: 'Naruto' };
const photo = (id: string, place: typeof A | null, takenAt: string | null): MomentPhoto =>
    ({ id, driveFileId: id, width: 1, height: 1, size: 1, place, takenAt });

describe('journeyStops', () => {
    it('orders by capture time and folds photos at one place in a row', () => {
        const stops = journeyStops({ photos: [
            photo('c', C, '2026-11-02T10:00:00'),
            photo('a1', A, '2026-11-01T09:00:00'),
            photo('x', null, '2026-11-01T09:30:00'),
            photo('a2', { ...A, lat: 34.601 }, '2026-11-01T09:40:00'),
            photo('b', B, '2026-11-01T15:00:00'),
            photo('a3', A, '2026-11-02T18:00:00')
        ] });
        expect(stops.map((stop) => [stop.name, stop.photos.map((p) => p.id)])).toEqual([
            ['Cầu Akashi', ['a1', 'a2']], ['Awaji', ['b']], ['Naruto', ['c']], ['Cầu Akashi', ['a3']]
        ]);
        expect(stops[0].takenAt).toBe('2026-11-01T09:00:00');
    });

    it('keeps the moment order when some capture times are missing', () => {
        const stops = journeyStops({ photos: [photo('b', B, null), photo('a', A, '2026-11-01T09:00:00')] });
        expect(stops.map((stop) => stop.name)).toEqual(['Awaji', 'Cầu Akashi']);
    });
});

describe('animation helpers', () => {
    it('gives bounded leg times, eased fractions and points along a leg', () => {
        const stops = journeyStops({ photos: [photo('a', A, null), photo('c', C, null)] });
        expect(legDuration(stops[0], stops[1])).toBeGreaterThanOrEqual(1500);
        expect(legDuration(stops[0], stops[1])).toBeLessThanOrEqual(4500);
        expect([easeInOut(0), easeInOut(0.5), easeInOut(1)]).toEqual([0, 0.5, 1]);
        expect(along(A, C, 0.5)).toEqual({ lat: 34.425, lng: 134.85 });
    });
});
