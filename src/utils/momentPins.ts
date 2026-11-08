// Pins for the moments map: one pin per place, each holding the moments (and their photos)
// taken there. A photo's own place wins; photos without one use the moment's place.
import type { Moment, MomentPhoto } from '../firebase/moments';
import { distanceKm, samePlace } from './geo';

/** Pins closer than this are one pin (several moments at home, say). */
export const PIN_MERGE_KM = 0.05;

export interface PinEntry {
    moment: Moment;
    photos: MomentPhoto[]; // photos of this moment at this place, in moment order
    name: string;
}

export interface MapPin {
    key: string;
    lat: number;
    lng: number;
    name: string;
    /** Newest moment first. */
    entries: PinEntry[];
    /** Photo shown on the pin: the newest moment's first photo here. */
    cover: MomentPhoto | null;
    photoCount: number;
}

const within = (a: { lat: number; lng: number }, b: { lat: number; lng: number }, km: number) => distanceKm(a, b) < km;

export const momentPins = (moments: Moment[]): MapPin[] => {
    const pins: MapPin[] = [];
    const sorted = [...moments].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    sorted.forEach((moment) => {
        // This moment's places, each with its photos.
        const spots: Array<{ lat: number; lng: number; name: string; photos: MomentPhoto[] }> = [];
        const spotFor = (point: { lat: number; lng: number; name: string }) => {
            let spot = spots.find((item) => samePlace(item, point));
            if (!spot) {
                spot = { lat: point.lat, lng: point.lng, name: point.name, photos: [] };
                spots.push(spot);
            }
            if (!spot.name && point.name) spot.name = point.name;
            return spot;
        };
        const fallback = moment.location ? { lat: moment.location.lat, lng: moment.location.lng, name: moment.location.name } : null;
        moment.photos.forEach((photo) => {
            const point = photo.place || fallback;
            if (point) spotFor(point).photos.push(photo);
        });
        if (fallback && !spots.length) spotFor(fallback);

        spots.forEach((spot) => {
            let pin = pins.find((item) => within(item, spot, PIN_MERGE_KM));
            if (!pin) {
                pin = { key: `${spot.lat.toFixed(5)},${spot.lng.toFixed(5)}`, lat: spot.lat, lng: spot.lng, name: spot.name, entries: [], cover: null, photoCount: 0 };
                pins.push(pin);
            }
            if (!pin.name && spot.name) pin.name = spot.name;
            pin.entries.push({ moment, photos: spot.photos, name: spot.name });
            if (!pin.cover && spot.photos[0]) pin.cover = spot.photos[0];
            pin.photoCount += spot.photos.length;
        });
    });
    return pins;
};
