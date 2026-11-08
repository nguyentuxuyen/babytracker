// Distances between photo positions, to tell "same place" from "somewhere else".
import type { GpsPoint } from './photoExif';

/** Photos closer than this are treated as the same place. */
export const SAME_PLACE_KM = 1;

export const distanceKm = (a: GpsPoint, b: GpsPoint) => {
    const rad = (value: number) => (value * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const samePlace = (a: GpsPoint, b: GpsPoint) => distanceKm(a, b) < SAME_PLACE_KM;

/** Distinct places among the points, in first-seen order (each within SAME_PLACE_KM of its first point). */
export const distinctPlaces = <T extends GpsPoint>(points: Array<T | null | undefined>): T[] => {
    const places: T[] = [];
    points.forEach((point) => {
        if (point && !places.some((place) => samePlace(place, point))) places.push(point);
    });
    return places;
};
