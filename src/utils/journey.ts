// The route of a moment: its photos' places in the order they were taken, with photos
// at the same place in a row folded into one stop (A -> B -> C, A again is a new stop).
import type { Moment, MomentPhoto, PhotoPlace, TravelMode } from '../firebase/moments';
import { distanceKm, samePlace } from './geo';

export interface JourneyStop {
    lat: number;
    lng: number;
    name: string;
    photos: MomentPhoto[];
    /** First capture time at this stop, when known. */
    takenAt: string | null;
    /** A point added by hand to a trip (where it starts or ends); it has no photos. */
    kind?: 'start' | 'end';
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

// ---- Travel modes and leg paths ----

export type LatLng = { lat: number; lng: number };

/** A leg is named by its two stops' first photos, so it survives photos being added elsewhere. */
const stopKey = (stop: JourneyStop) => stop.kind || stop.photos[0]?.id;
export const legKey = (from: JourneyStop, to: JourneyStop) => `${stopKey(from)}>${stopKey(to)}`;

/**
 * The stops of a trip made of several moments: an optional start point, the places of
 * every moment's photos (earliest moment first), then an optional end point.
 */
export const tripStops = (
    moments: Array<Pick<Moment, 'photos' | 'date'> & { createdAt?: string }>,
    start: PhotoPlace | null = null,
    end: PhotoPlace | null = null
): JourneyStop[] => {
    const ordered = [...moments].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
    const stops = journeyStops({ photos: ordered.flatMap((moment) => moment.photos) });
    const extra = (place: PhotoPlace, kind: 'start' | 'end'): JourneyStop => ({ lat: place.lat, lng: place.lng, name: place.name, photos: [], takenAt: null, kind });
    return [...(start ? [extra(start, 'start')] : []), ...stops, ...(end ? [extra(end, 'end')] : [])];
};

const hoursBetween = (from: JourneyStop, to: JourneyStop) => {
    if (!from.takenAt || !to.takenAt) return null;
    const ms = new Date(to.takenAt).getTime() - new Date(from.takenAt).getTime();
    return Number.isFinite(ms) ? ms / 3600000 : null;
};

/**
 * A first guess before the user picks: a short hop is on foot; far, or faster than a car
 * could have gone, is a flight; otherwise by car. Ships are only known when no road exists.
 */
export const guessMode = (from: JourneyStop, to: JourneyStop): TravelMode => {
    const km = distanceKm(from, to);
    if (km < 1.5) return 'walk';
    const hours = hoursBetween(from, to);
    if (km > 600 || (km > 250 && hours !== null && hours > 0 && km / hours > 150)) return 'plane';
    return 'car';
};

/** A flight drawn as a gentle curve (a quadratic Bézier bowed to one side). */
export const flightArc = (from: LatLng, to: LatLng, steps = 48): LatLng[] => {
    const mid = { lat: (from.lat + to.lat) / 2, lng: (from.lng + to.lng) / 2 };
    const bow = 0.2;
    const control = { lat: mid.lat + (to.lng - from.lng) * bow, lng: mid.lng - (to.lat - from.lat) * bow };
    return Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const a = (1 - t) ** 2;
        const b = 2 * (1 - t) * t;
        const c = t ** 2;
        return { lat: a * from.lat + b * control.lat + c * to.lat, lng: a * from.lng + b * control.lng + c * to.lng };
    });
};

/** Point, heading (degrees, 0 = east, counter-clockwise) and segment index a fraction of the way along a path (by distance). */
export const alongPath = (path: LatLng[], fraction: number): { point: LatLng; heading: number; index: number } => {
    if (path.length < 2) return { point: path[0], heading: 0, index: 0 };
    const lengths = path.slice(1).map((point, i) => distanceKm(path[i], point));
    const total = lengths.reduce((sum, length) => sum + length, 0);
    let remaining = Math.max(0, Math.min(1, fraction)) * total;
    for (let i = 0; i < lengths.length; i += 1) {
        if (remaining <= lengths[i] || i === lengths.length - 1) {
            const local = lengths[i] ? Math.min(1, remaining / lengths[i]) : 1;
            const a = path[i];
            const b = path[i + 1];
            return {
                point: along(a, b, local),
                index: i,
                heading: (Math.atan2(b.lat - a.lat, (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180)) * 180) / Math.PI
            };
        }
        remaining -= lengths[i];
    }
    return { point: path[path.length - 1], heading: 0, index: path.length - 2 };
};
