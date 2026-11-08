// Place names for moment locations, from OpenStreetMap's Nominatim (free, no key; fine for
// a few lookups a day by hand, which is all the moment editor does).
import { currentLanguage } from '../i18n';

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export interface PlaceResult {
    lat: number;
    lng: number;
    name: string;
}

interface NominatimPlace {
    lat: string;
    lon: string;
    name?: string;
    display_name?: string;
    address?: Record<string, string>;
}

const AREA_KEYS = ['city_district', 'suburb', 'town', 'city', 'village', 'county', 'state'];

/** "Công viên Ueno, Taito" rather than the full postal address. */
export const shortPlaceName = (place: NominatimPlace) => {
    const address = place.address || {};
    const area = AREA_KEYS.map((key) => address[key]).find(Boolean);
    const main = place.name || address.road || area || (place.display_name || '').split(',')[0];
    const parts = [main, area].filter((part, index, list) => part && list.indexOf(part) === index);
    return (parts.length ? parts.join(', ') : place.display_name || '').trim().slice(0, 120);
};

const toResult = (place: NominatimPlace): PlaceResult | null => {
    const lat = Number(place.lat);
    const lng = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, name: shortPlaceName(place) };
};

const getJson = async (path: string, params: Record<string, string>, signal?: AbortSignal) => {
    const query = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': currentLanguage(), ...params });
    const response = await fetch(`${NOMINATIM}/${path}?${query.toString()}`, { signal });
    if (!response.ok) throw new Error(`geocode ${response.status}`);
    return response.json();
};

// Same spot (about 10 m) asked twice in a session: answer from memory, Nominatim asks for few calls.
const reverseCache = new Map<string, Promise<string | null>>();

export const reverseGeocode = (lat: number, lng: number): Promise<string | null> => {
    const key = `${currentLanguage()}:${lat.toFixed(4)},${lng.toFixed(4)}`;
    let answer = reverseCache.get(key);
    if (!answer) {
        answer = getJson('reverse', { lat: String(lat), lon: String(lng), zoom: '17' })
            .then((place) => (place && !place.error ? shortPlaceName(place) || null : null))
            .catch(() => null);
        // Failures are not kept, so a later try can still succeed.
        answer.then((name) => { if (!name) reverseCache.delete(key); });
        reverseCache.set(key, answer);
    }
    return answer;
};

export const searchPlaces = async (text: string, signal?: AbortSignal): Promise<PlaceResult[]> => {
    const places: NominatimPlace[] = await getJson('search', { q: text, limit: '5' }, signal);
    return (Array.isArray(places) ? places : []).map(toResult).filter((place): place is PlaceResult => place !== null);
};

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
