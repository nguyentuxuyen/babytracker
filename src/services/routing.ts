// Road routes for the journey animation, from the public OSRM server (OpenStreetMap data,
// free, no key). It is a demo server: slow or down at times, so callers fall back to a
// straight line. Answers are kept for the session.
import type { LatLng } from '../utils/journey';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const TIMEOUT_MS = 8000;

/** Road points, 'no-road' when there is none (e.g. across the sea), or null when the lookup failed. */
export type RoadRoute = LatLng[] | 'no-road' | null;

const cache = new Map<string, Promise<RoadRoute>>();

export const parseOsrm = (data: any): RoadRoute => {
    if (data?.code === 'NoRoute') return 'no-road';
    const coordinates = data?.code === 'Ok' ? data.routes?.[0]?.geometry?.coordinates : null;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
    return coordinates
        .filter((pair: unknown) => Array.isArray(pair) && pair.length >= 2)
        .map(([lng, lat]: number[]) => ({ lat, lng }));
};

export const roadRoute = (from: LatLng, to: LatLng): Promise<RoadRoute> => {
    const key = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
    let answer = cache.get(key);
    if (!answer) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
        answer = fetch(`${OSRM}/${key}?overview=full&geometries=geojson`, { signal: controller.signal })
            // OSRM answers "no route" with status 400 and a JSON body.
            .then((response) => response.json())
            .then(parseOsrm)
            .catch(() => null)
            .finally(() => clearTimeout(timer));
        answer.then((route) => { if (route === null) cache.delete(key); });
        cache.set(key, answer);
    }
    return answer;
};
