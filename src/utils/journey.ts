// The route of a moment: its photos' places in the order they were taken, with photos
// at the same place in a row folded into one stop (A -> B -> C, A again is a new stop).
import type { Moment, MomentPhoto } from '../firebase/moments';
import { distanceKm, samePlace } from './geo';

export interface JourneyStop {
    lat: number;
    lng: number;
    name: string;
    photos: MomentPhoto[];
    /** First capture time at this stop, when known. */
    takenAt: string | null;
}

export const journeyStops = (moment: Pick<Moment, 'photos'>): JourneyStop[] => {
    const placed = moment.photos.filter((photo) => photo.place);
    // Capture times give the real order; without them, the moment's own photo order.
    const ordered = placed.every((photo) => photo.takenAt)
        ? [...placed].sort((a, b) => a.takenAt!.localeCompare(b.takenAt!))
        : placed;
    const stops: JourneyStop[] = [];
    ordered.forEach((photo) => {
        const place = photo.place!;
        const last = stops[stops.length - 1];
        if (last && samePlace(last, place)) {
            last.photos.push(photo);
            if (!last.name && place.name) last.name = place.name;
            return;
        }
        stops.push({ lat: place.lat, lng: place.lng, name: place.name, photos: [photo], takenAt: photo.takenAt });
    });
    return stops;
};

/** Milliseconds to drive one leg: longer legs take longer, within limits that keep it watchable. */
export const legDuration = (from: JourneyStop, to: JourneyStop) =>
    Math.round(Math.min(4500, Math.max(1500, 1200 + Math.sqrt(distanceKm(from, to)) * 350)));

/** Point a fraction of the way along a leg (straight line; there is no road data). */
export const along = (from: { lat: number; lng: number }, to: { lat: number; lng: number }, fraction: number) => ({
    lat: from.lat + (to.lat - from.lat) * fraction,
    lng: from.lng + (to.lng - from.lng) * fraction
});

/** Smooth start and stop. */
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
