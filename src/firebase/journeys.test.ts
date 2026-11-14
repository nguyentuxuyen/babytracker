vi.mock('firebase/firestore', () => {
    let autoId = 0;
    return {
        collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
        doc: vi.fn((parent: any, ...segments: string[]) => {
            if (segments.length) return { id: segments[segments.length - 1], path: `${parent.path}/${segments.join('/')}` };
            autoId += 1;
            return { id: `auto-${autoId}`, path: `${parent.path}/auto-${autoId}` };
        }),
        setDoc: vi.fn(async () => undefined),
        updateDoc: vi.fn(async () => undefined),
        deleteDoc: vi.fn(async () => undefined),
        onSnapshot: vi.fn()
    };
});
vi.mock('./config', () => ({ db: {}, auth: {} }));
vi.mock('./googleDrive', () => ({}));
vi.mock('../utils/imageCompress', () => ({}));

import type { Mock } from 'vitest';
import { deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteJourney, normalizeJourney, saveJourney, saveJourneyLegModes, sortJourneys } from './journeys';

const home = { lat: 34.7, lng: 135.5, name: 'Nhà' };

describe('journeys', () => {
    beforeEach(() => vi.clearAllMocks());

    it('reads a stored trip, dropping what is not valid', () => {
        const journey = normalizeJourney('j1', {
            title: 'Awaji',
            momentIds: ['m1', 'm1', 7, '', 'm2'],
            start: home,
            end: { lat: 999, lng: 0, name: 'x' },
            legModes: { 'start>p1': 'car', 'p1>p2': 'rocket' }
        });
        expect(journey).toMatchObject({ id: 'j1', title: 'Awaji', momentIds: ['m1', 'm2'], start: home, end: null, legModes: { 'start>p1': 'car' } });
    });

    it('saves a new trip with its start, end and ways of travel (no undefined for Firestore)', async () => {
        const journey = await saveJourney('u1', { title: '  Awaji  ', momentIds: ['m1', 'm2'], start: home, end: null, legModes: { 'start>p1': 'ship' } });
        const [ref, data] = (setDoc as Mock).mock.calls[0];
        expect(ref.path).toBe(`users/u1/journeys/${journey.id}`);
        expect(data).toMatchObject({ title: 'Awaji', momentIds: ['m1', 'm2'], start: home, end: null, legModes: { 'start>p1': 'ship' } });
        expect(data).not.toHaveProperty('id');
        expect(Object.values(data).includes(undefined)).toBe(false);
        expect(data.createdAt).toBe(data.updatedAt);
    });

    it('keeps the id and creation time when a trip is changed', async () => {
        const existing = normalizeJourney('j1', { title: 'A', momentIds: ['m1'], createdAt: '2026-11-01T00:00:00.000Z' });
        const saved = await saveJourney('u1', { title: 'B', momentIds: ['m1'], start: null, end: home, legModes: {} }, existing);
        expect(saved).toMatchObject({ id: 'j1', title: 'B', end: home, createdAt: '2026-11-01T00:00:00.000Z' });
        expect((setDoc as Mock).mock.calls[0][0].path).toBe('users/u1/journeys/j1');
    });

    it('saves only the ways of travel, and deletes only the trip', async () => {
        await saveJourneyLegModes('u1', 'j1', { 'a>b': 'plane', bad: 'x' as never });
        expect((updateDoc as Mock).mock.calls[0][1]).toMatchObject({ legModes: { 'a>b': 'plane' } });
        await deleteJourney('u1', 'j1');
        expect((deleteDoc as Mock).mock.calls[0][0].path).toBe('users/u1/journeys/j1');
    });

    it('lists the newest trip first', () => {
        const a = normalizeJourney('a', { createdAt: '2026-11-01' });
        const b = normalizeJourney('b', { createdAt: '2026-11-05' });
        expect(sortJourneys([a, b]).map((journey) => journey.id)).toEqual(['b', 'a']);
    });
});
