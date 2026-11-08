import { distanceKm, distinctPlaces, samePlace } from './geo';

describe('geo', () => {
    it('measures distance and groups nearby points', () => {
        expect(distanceKm({ lat: 35.6812, lng: 139.7671 }, { lat: 35.7138, lng: 139.7773 })).toBeCloseTo(3.7, 1);
        expect(samePlace({ lat: 35.5, lng: 139.6 }, { lat: 35.503, lng: 139.6 })).toBe(true);
        expect(distinctPlaces([{ lat: 35.5, lng: 139.6 }, null, { lat: 35.5005, lng: 139.6 }, { lat: 34.7, lng: 135.5 }]))
            .toEqual([{ lat: 35.5, lng: 139.6 }, { lat: 34.7, lng: 135.5 }]);
    });
});
