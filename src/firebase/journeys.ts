// "Hành trình": a trip made of several moments, kept as its own record so the moments stay
// separate. It can have a start and an end point without photos (home, the airport) and
// remembers how each leg was travelled.
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './config';
import { PhotoPlace, TRAVEL_MODES, TravelMode, normalizePhotoPlace } from './moments';

export const MAX_MOMENTS_PER_JOURNEY = 30;

export interface Journey {
    id: string;
    title: string;
    momentIds: string[];
    start: PhotoPlace | null;
    end: PhotoPlace | null;
    /** How each leg was travelled, by legKey (see utils/journey.ts). */
    legModes: Record<string, TravelMode>;
    createdAt: string;
    updatedAt: string;
}

export interface JourneyInput {
    title: string;
    momentIds: string[];
    start: PhotoPlace | null;
    end: PhotoPlace | null;
    legModes: Record<string, TravelMode>;
}

const journeysCollection = (uid: string) => collection(db, 'users', uid, 'journeys');

const normalizeModes = (raw: any): Record<string, TravelMode> => {
    if (!raw || typeof raw !== 'object') return {};
    const modes: Record<string, TravelMode> = {};
    Object.entries(raw).forEach(([key, mode]) => {
        if (key.length <= 100 && (TRAVEL_MODES as readonly string[]).includes(mode as string)) modes[key] = mode as TravelMode;
    });
    return modes;
};

export const normalizeJourney = (id: string, data: Record<string, unknown>): Journey => ({
    id,
    title: typeof data.title === 'string' ? data.title : '',
    momentIds: Array.isArray(data.momentIds)
        ? [...new Set(data.momentIds.filter((item): item is string => typeof item === 'string' && item.length > 0))].slice(0, MAX_MOMENTS_PER_JOURNEY)
        : [],
    start: normalizePhotoPlace(data.start),
    end: normalizePhotoPlace(data.end),
    legModes: normalizeModes(data.legModes),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : ''
});

/** Newest first. */
export const sortJourneys = (journeys: Journey[]) => [...journeys].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const subscribeJourneys = (uid: string, onChange: (journeys: Journey[]) => void, onError?: (error: Error) => void) => onSnapshot(
    journeysCollection(uid),
    (snapshot) => onChange(sortJourneys(snapshot.docs.map((item) => normalizeJourney(item.id, item.data())))),
    onError
);

export const saveJourney = async (uid: string, input: JourneyInput, existing?: Journey): Promise<Journey> => {
    const ref = existing ? doc(journeysCollection(uid), existing.id) : doc(journeysCollection(uid));
    const now = new Date().toISOString();
    const journey = normalizeJourney(ref.id, {
        title: input.title.trim().slice(0, 120),
        momentIds: input.momentIds,
        start: input.start,
        end: input.end,
        legModes: input.legModes,
        createdAt: existing?.createdAt || now,
        updatedAt: now
    });
    const { id, ...data } = journey;
    await setDoc(ref, data);
    return journey;
};

/** Saves how the legs were travelled (only that field changes). */
export const saveJourneyLegModes = async (uid: string, journeyId: string, legModes: Record<string, TravelMode>) => {
    await updateDoc(doc(journeysCollection(uid), journeyId), { legModes: normalizeModes(legModes), updatedAt: new Date().toISOString() });
};

export const deleteJourney = async (uid: string, journeyId: string) => {
    await deleteDoc(doc(journeysCollection(uid), journeyId));
};
