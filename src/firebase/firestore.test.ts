import type { Mock } from 'vitest';

// Firestore SDK replaced by plain fakes: refs are { id, path } and writes are spies.
vi.mock('firebase/firestore', () => {
    let autoId = 0;
    return {
        collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
        doc: vi.fn((parent: any, ...segments: string[]) => {
            if (segments.length === 0) {
                autoId += 1;
                return { id: `auto-${autoId}`, path: `${parent.path}/auto-${autoId}` };
            }
            return { id: segments[segments.length - 1], path: segments.join('/') };
        }),
        setDoc: vi.fn(async () => undefined),
        deleteDoc: vi.fn(async () => undefined),
        updateDoc: vi.fn(async () => undefined),
        getDoc: vi.fn(),
        getDocs: vi.fn(),
        query: vi.fn(),
        orderBy: vi.fn(),
        limit: vi.fn(),
        where: vi.fn(),
        serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
        runTransaction: vi.fn(),
        writeBatch: vi.fn(),
        onSnapshot: vi.fn(),
        Timestamp: { fromDate: (date: Date) => date }
    };
});
vi.mock('./config', () => ({ db: {} }));
vi.mock('./auth', () => ({ getCurrentUser: vi.fn(() => null) }));

const USER = 'user-1';
const QUEUE_KEY = `offline-activity-queue:${USER}`;
const at = new Date(2026, 9, 9, 8, 30);

const queued = (localId: string, activity: Record<string, any> = {}) => ({
    localId,
    userId: USER,
    activity: { babyId: USER, type: 'feeding', timestamp: at.toISOString(), details: { amount: 120, foodType: 'milk' }, ...activity },
    queuedAt: at.toISOString(),
    attempts: 0
});

const readQueue = () => JSON.parse(window.localStorage.getItem(QUEUE_KEY) || '[]');

let sdk: typeof import('firebase/firestore');
let firestore: typeof import('./firestore').firestore;

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sdk = await import('firebase/firestore');
    ({ firestore } = await import('./firestore'));
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('syncPendingActivities (legacy offline queue)', () => {
    it('does nothing when the queue is empty', async () => {
        await expect(firestore.syncPendingActivities(USER)).resolves.toEqual({ synced: 0, failed: 0 });
        expect(sdk.setDoc).not.toHaveBeenCalled();
    });

    it('writes each item under its local id and empties the queue', async () => {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued('offline-a'), queued('offline-b')]));
        const onComplete = vi.fn();
        window.addEventListener('offline-sync-complete', onComplete);

        const result = await firestore.syncPendingActivities(USER);

        expect(result).toEqual({ synced: 2, failed: 0 });
        const setDoc = sdk.setDoc as Mock;
        expect(setDoc.mock.calls.map(([ref]) => ref.path)).toEqual([
            `users/${USER}/activities/offline-a`,
            `users/${USER}/activities/offline-b`
        ]);
        expect(setDoc.mock.calls[0][1]).toMatchObject({
            babyId: USER,
            type: 'feeding',
            timestamp: at,
            details: { amount: 120, foodType: 'milk' },
            createdAt: 'SERVER_TIMESTAMP'
        });
        expect(window.localStorage.getItem(QUEUE_KEY)).toBeNull();
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect((onComplete.mock.calls[0][0] as CustomEvent).detail).toEqual({ synced: 2, failed: 0 });
        window.removeEventListener('offline-sync-complete', onComplete);
    });

    it('keeps items whose write failed and drops items that can never be valid', async () => {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify([
            queued('offline-ok'),
            queued('offline-bad', { type: 'party' }),
            queued('offline-retry')
        ]));
        (sdk.setDoc as Mock).mockImplementation(async (ref: { id: string }) => {
            if (ref.id === 'offline-retry') throw new Error('unavailable');
        });

        const result = await firestore.syncPendingActivities(USER);

        expect(result).toEqual({ synced: 1, failed: 1 });
        expect(readQueue().map((item: { localId: string }) => item.localId)).toEqual(['offline-retry']);
    });

    it('runs once when called again before the first sync finishes', async () => {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued('offline-a')]));
        let release!: () => void;
        (sdk.setDoc as Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));

        const first = firestore.syncPendingActivities(USER);
        const second = firestore.syncPendingActivities(USER);
        await vi.waitFor(() => expect(sdk.setDoc).toHaveBeenCalled());
        release();

        await expect(first).resolves.toEqual({ synced: 1, failed: 0 });
        await expect(second).resolves.toEqual({ synced: 1, failed: 0 });
        expect(sdk.setDoc).toHaveBeenCalledTimes(1);
    });

    it('keeps an item queued by another tab while the sync was running', async () => {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued('offline-a')]));
        (sdk.setDoc as Mock).mockImplementationOnce(async () => {
            window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued('offline-a'), queued('offline-new')]));
        });

        const result = await firestore.syncPendingActivities(USER);

        expect(result).toEqual({ synced: 1, failed: 1 });
        expect(readQueue().map((item: { localId: string }) => item.localId)).toEqual(['offline-new']);
    });

    it('ignores a corrupted queue instead of throwing', async () => {
        window.localStorage.setItem(QUEUE_KEY, '{not json');

        await expect(firestore.syncPendingActivities(USER)).resolves.toEqual({ synced: 0, failed: 0 });
    });
});

describe('queued activities in reads, counts and deletes', () => {
    it('counts queued items as pending', async () => {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued('offline-a'), queued('offline-b')]));

        await expect(firestore.getPendingActivitiesCount(USER)).resolves.toBe(2);
        expect(firestore.isPendingWrite('offline-a')).toBe(true);
        expect(firestore.isPendingWrite('server-id')).toBe(false);
    });

    it('removes a queued item when it is deleted, so it is not synced later', async () => {
        window.localStorage.setItem(QUEUE_KEY, JSON.stringify([queued('offline-a'), queued('offline-b')]));

        await expect(firestore.deleteActivity(USER, 'offline-a')).resolves.toBe(true);

        expect(readQueue().map((item: { localId: string }) => item.localId)).toEqual(['offline-b']);
    });

    it('refuses to update an activity that only exists in the queue', async () => {
        await expect(firestore.updateActivity(USER, 'offline-a', { type: 'memo', details: {} })).resolves.toBe(false);
        expect(sdk.updateDoc).not.toHaveBeenCalled();
    });
});

describe('saveActivity while offline', () => {
    const milk = { babyId: USER, type: 'feeding' as const, timestamp: at, details: { amount: 90, foodType: 'milk' } };

    it('returns the saved activity once the server confirms the write', async () => {
        const saved = await firestore.saveActivity(USER, milk as any);

        expect(saved).toMatchObject({ type: 'feeding', timestamp: at, details: { amount: 90 } });
        expect(firestore.isPendingWrite(saved.id)).toBe(false);
        await expect(firestore.getPendingActivitiesCount(USER)).resolves.toBe(0);
    });

    it('returns after the timeout and marks the write pending until the server confirms', async () => {
        vi.useFakeTimers();
        let confirm!: () => void;
        (sdk.setDoc as Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { confirm = resolve; }));
        const onComplete = vi.fn();
        window.addEventListener('offline-sync-complete', onComplete);

        const saving = firestore.saveActivity(USER, milk as any);
        await vi.advanceTimersByTimeAsync(4000);
        const saved = await saving;

        expect(firestore.isPendingWrite(saved.id)).toBe(true);
        await expect(firestore.getPendingActivitiesCount(USER)).resolves.toBe(1);

        confirm();
        await vi.waitFor(() => expect(firestore.isPendingWrite(saved.id)).toBe(false));
        expect((onComplete.mock.calls[0][0] as CustomEvent).detail).toEqual({ synced: 1, failed: 0 });
        window.removeEventListener('offline-sync-complete', onComplete);
    });

    it('throws for an invalid activity without writing anything', async () => {
        await expect(firestore.saveActivity(USER, { ...milk, type: 'party' } as any)).rejects.toThrow();
        expect(sdk.setDoc).not.toHaveBeenCalled();
    });
});

describe('finishOngoingSleep (stopping the sleep timer)', () => {
    const BABY = 'baby-1';
    const start = new Date(2026, 9, 31, 13, 0);
    const end = new Date(2026, 9, 31, 14, 30);
    const sleep = { babyId: BABY, type: 'sleep' as const, timestamp: end, details: { time: end, duration: 90 } };
    const markerPath = `users/${USER}/ongoingSleep/${BABY}`;
    const activityId = `sleep-${BABY}-${start.getTime()}`;

    // Fake server: docs by path; runTransaction applies writes like Firestore does.
    let server: Map<string, Record<string, any>>;
    const snap = (path: string) => ({ exists: () => server.has(path), data: () => server.get(path) });
    beforeEach(() => {
        server = new Map();
        (sdk.runTransaction as Mock).mockImplementation(async (_db: unknown, update: (tx: any) => Promise<unknown>) => {
            const writes: Array<() => void> = [];
            const tx = {
                get: vi.fn(async (ref: { path: string }) => snap(ref.path)),
                set: vi.fn((ref: { path: string }, data: any) => { writes.push(() => server.set(ref.path, data)); }),
                delete: vi.fn((ref: { path: string }) => { writes.push(() => server.delete(ref.path)); })
            };
            const result = await update(tx);
            writes.forEach((write) => write());
            return result;
        });
        (sdk.writeBatch as Mock).mockImplementation(() => {
            const writes: Array<() => void> = [];
            return {
                set: (ref: { path: string }, data: any) => writes.push(() => server.set(ref.path, data)),
                delete: (ref: { path: string }) => writes.push(() => server.delete(ref.path)),
                commit: vi.fn(async () => writes.forEach((write) => write()))
            };
        });
    });
    const sleepRecords = () => Array.from(server.keys()).filter((path) => path.startsWith(`users/${USER}/activities/`));

    it('saves one sleep and clears the timer when the session is still running', async () => {
        server.set(markerPath, { startTime: start });

        const result = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        expect(result).toMatchObject({ status: 'saved', pending: false, activity: { id: activityId, type: 'sleep' } });
        expect(server.has(markerPath)).toBe(false);
        expect(sleepRecords()).toEqual([`users/${USER}/activities/${activityId}`]);
        expect(server.get(`users/${USER}/activities/${activityId}`)).toMatchObject({ details: { duration: 90 } });
    });

    it('adds no second record when another device already stopped the same sleep', async () => {
        server.set(markerPath, { startTime: start });
        const first = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);
        expect(first.status).toBe('saved');

        // This device still shows the old timer and stops it a bit later.
        const later = new Date(end.getTime() + 10 * 60 * 1000);
        const second = await firestore.finishOngoingSleep(USER, BABY, start, { ...sleep, timestamp: later, details: { time: later, duration: 100 } } as any);

        expect(second).toEqual({ status: 'alreadyStopped' });
        expect(sleepRecords()).toHaveLength(1);
        expect(server.get(`users/${USER}/activities/${activityId}`)).toMatchObject({ details: { duration: 90 } });
    });

    it('adds no record when the timer was stopped by an older app version (marker gone)', async () => {
        const result = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        expect(result).toEqual({ status: 'alreadyStopped' });
        expect(sleepRecords()).toHaveLength(0);
    });

    it('leaves a newer sleep running when the stale timer belongs to an earlier session', async () => {
        const newer = new Date(2026, 9, 31, 15, 0);
        server.set(markerPath, { startTime: newer });

        const result = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        expect(result).toEqual({ status: 'alreadyStopped' });
        expect(server.get(markerPath)).toEqual({ startTime: newer });
        expect(sleepRecords()).toHaveLength(0);
    });

    it('offline: writes to the local cache under the same id, so both devices end with one record', async () => {
        server.set(markerPath, { startTime: start });
        await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        (sdk.runTransaction as Mock).mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
        const result = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        expect(result).toMatchObject({ status: 'saved', pending: true, activity: { id: activityId } });
        await vi.waitFor(() => expect(firestore.isPendingWrite(activityId)).toBe(false));
        expect(sleepRecords()).toEqual([`users/${USER}/activities/${activityId}`]);
    });

    it('skips the server check when the browser reports no network', async () => {
        vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
        server.set(markerPath, { startTime: start });

        const result = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        expect(result).toMatchObject({ status: 'saved', pending: true });
        expect(sdk.runTransaction).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(server.has(markerPath)).toBe(false));
    });

    it('reports an error and writes nothing when the server refuses', async () => {
        server.set(markerPath, { startTime: start });
        (sdk.runTransaction as Mock).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));

        const result = await firestore.finishOngoingSleep(USER, BABY, start, sleep as any);

        expect(result).toEqual({ status: 'error' });
        expect(sdk.writeBatch).not.toHaveBeenCalled();
        expect(server.has(markerPath)).toBe(true);
    });
});

describe('subscribeOngoingSleep', () => {
    it('reports the running session and its end as they happen on any device', () => {
        let emit!: (snapshot: any) => void;
        const unsubscribe = vi.fn();
        (sdk.onSnapshot as Mock).mockImplementation((_ref: unknown, next: (snapshot: any) => void) => {
            emit = next;
            return unsubscribe;
        });
        const onChange = vi.fn();
        const start = new Date(2026, 9, 31, 13, 0);

        const stop = firestore.subscribeOngoingSleep(USER, 'baby-1', onChange);
        emit({ exists: () => true, data: () => ({ startTime: { toDate: () => start } }) });
        emit({ exists: () => false, data: () => undefined });
        stop();

        expect(onChange.mock.calls).toEqual([[{ startTime: start }], [null]]);
        expect(unsubscribe).toHaveBeenCalled();
    });
});
