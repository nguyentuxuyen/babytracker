import { along, alongPath, easeInOut, flightArc, guessMode, journeyStops, legDuration, legKey, tripStops } from './journey';
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

describe('travel modes and paths', () => {
    const stop = (lat: number, lng: number, takenAt: string | null, id: string) => ({ lat, lng, name: '', photos: [photo(id, null, takenAt)], takenAt });
    it('guesses walk, car and plane', () => {
        const osaka = stop(34.69, 135.5, '2026-11-01T08:00:00', 'o');
        expect(guessMode(osaka, stop(34.695, 135.505, null, 'n'))).toBe('walk');
        expect(guessMode(osaka, stop(34.34, 134.9, null, 'a'))).toBe('car');
        expect(guessMode(osaka, stop(43.06, 141.35, null, 's'))).toBe('plane'); // Sapporo
        expect(guessMode(osaka, stop(35.68, 139.76, '2026-11-01T10:00:00', 't'))).toBe('plane'); // Tokyo in 2 h
        expect(guessMode(osaka, stop(35.68, 139.76, '2026-11-01T16:00:00', 't'))).toBe('car');
        expect(legKey(osaka, stop(1, 1, null, 'x'))).toBe('o>x');
    });

    it('draws a flight arc from start to end and moves along a path', () => {
        const arc = flightArc({ lat: 0, lng: 0 }, { lat: 0, lng: 10 }, 10);
        expect(arc[0]).toEqual({ lat: 0, lng: 0 });
        expect(arc[10]).toEqual({ lat: 0, lng: 10 });
        expect(Math.abs(arc[5].lat)).toBeGreaterThan(0.5);
        const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }];
        const half = alongPath(path, 0.5);
        expect(half.point.lng).toBeCloseTo(1, 2);
        expect(alongPath(path, 0.25).heading).toBeCloseTo(0, 0);
        expect(alongPath(path, 0.9).heading).toBeCloseTo(90, 0);
    });
});

describe('tripStops', () => {
    const shot = (id: string, lat: number, lng: number, takenAt: string | null = null) => ({
        id, driveFileId: `d-${id}`, width: 1, height: 1, size: 1, place: { lat, lng, name: id }, takenAt
    });
    const home = { lat: 34.7, lng: 135.5, name: 'Nhà' };

    it('joins the moments by date and adds the start and end points', () => {
        const stops = tripStops([
            { date: '2026-11-02', photos: [shot('c', 34.3, 134.8)] },
            { date: '2026-11-01', photos: [shot('a', 34.6, 135.0), shot('b', 34.5, 134.9)] }
        ], home, home);
        expect(stops.map((stop) => stop.kind || stop.photos[0].id)).toEqual(['start', 'a', 'b', 'c', 'end']);
        expect(stops[0]).toMatchObject({ lat: 34.7, lng: 135.5, name: 'Nhà', photos: [] });
    });

    it('has no extra points when none were added', () => {
        expect(tripStops([{ date: '2026-11-01', photos: [shot('a', 34.6, 135.0)] }]).map((stop) => stop.kind)).toEqual([undefined]);
    });

    it('names the legs to and from the added points', () => {
        const stops = tripStops([{ date: '2026-11-01', photos: [shot('a', 34.6, 135.0)] }], home, home);
        expect(legKey(stops[0], stops[1])).toBe('start>a');
        expect(legKey(stops[1], stops[2])).toBe('a>end');
    });
});
