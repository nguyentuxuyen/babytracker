import { parseOsrm } from './routing';

describe('parseOsrm', () => {
    it('reads route points, no-road, and broken answers', () => {
        expect(parseOsrm({ code: 'Ok', routes: [{ geometry: { coordinates: [[135, 34.6], [134.9, 34.5]] } }] }))
            .toEqual([{ lat: 34.6, lng: 135 }, { lat: 34.5, lng: 134.9 }]);
        expect(parseOsrm({ code: 'NoRoute' })).toBe('no-road');
        expect(parseOsrm({ code: 'Ok', routes: [] })).toBeNull();
        expect(parseOsrm(null)).toBeNull();
    });
});
