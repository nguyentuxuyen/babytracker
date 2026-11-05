import type { Mock } from 'vitest';

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
        deleteDoc: vi.fn(async () => undefined),
        onSnapshot: vi.fn(),
        orderBy: vi.fn(),
        query: vi.fn()
    };
});
vi.mock('firebase/storage', () => ({
    ref: vi.fn((_storage: unknown, path: string) => ({ path })),
    uploadBytesResumable: vi.fn(),
    getDownloadURL: vi.fn(async (objectRef: { path: string }) => `https://files.test/${objectRef.path}`),
    deleteObject: vi.fn(async () => undefined)
}));
vi.mock('./config', () => ({ db: {}, storage: {} }));
vi.mock('../utils/imageCompress', () => ({
    compressImage: vi.fn(async () => ({ blob: { size: 300_000 }, width: 1600, height: 1200 }))
}));

import { deleteDoc, setDoc } from 'firebase/firestore';
import { deleteObject, uploadBytesResumable } from 'firebase/storage';
import {
    Moment,
    deleteMoment,
    groupMomentsByMonth,
    normalizeMoment,
    saveMoment,
    sortMoments,
    toLocalDateKey,
    toMomentError
} from './moments';

const photo = (id: string) => ({ id, storagePath: `users/u/moments/m1/${id}.jpg`, url: `https://x/${id}`, width: 1, height: 1, size: 1 });
const moment = (id: string, date: string, createdAt = '2026-11-01T00:00:00Z', photos = [photo(`${id}-p`)]): Moment => ({
    id, date, createdAt, title: id, note: '', photos, updatedAt: createdAt
});

// Fake upload task that reports one progress event and then completes (or fails).
const fakeTask = (failWith?: unknown) => ({
    on: (_event: string, progress: (s: any) => void, error: (e: unknown) => void, done: () => void) => {
        progress({ bytesTransferred: 1, totalBytes: 2 });
        if (failWith) error(failWith); else done();
    }
});
const image = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
    vi.clearAllMocks();
    (uploadBytesResumable as Mock).mockImplementation(() => fakeTask());
});

describe('moment helpers', () => {
    it('formats local dates as YYYY-MM-DD', () => {
        expect(toLocalDateKey(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05');
    });

    it('drops documents without a valid date and broken photos', () => {
        expect(normalizeMoment('a', { title: 'x' })).toBeNull();
        expect(normalizeMoment('a', { date: '2026-11-05', photos: [{ id: 'p' }, photo('ok')] }))
            .toMatchObject({ id: 'a', title: '', note: '', photos: [{ id: 'ok' }] });
    });

    it('sorts newest day first and groups by month', () => {
        const sorted = sortMoments([
            moment('oct', '2026-10-20'),
            moment('nov-late', '2026-11-05', '2026-11-05T10:00:00Z'),
            moment('nov-early', '2026-11-05', '2026-11-05T08:00:00Z'),
            moment('nov-1', '2026-11-01')
        ]);
        expect(sorted.map((m) => m.id)).toEqual(['nov-early', 'nov-late', 'nov-1', 'oct']);
        expect(groupMomentsByMonth(sorted).map(([month, items]) => [month, items.length])).toEqual([['2026-11', 3], ['2026-10', 1]]);
    });

    it('maps missing-bucket and permission errors to storage-disabled', () => {
        expect(toMomentError({ code: 'storage/bucket-not-found' }).code).toBe('storage-disabled');
        expect(toMomentError({ code: 'storage/unauthorized' }).code).toBe('storage-disabled');
        expect(toMomentError({ code: 'storage/canceled' }).code).toBe('failed');
    });
});

describe('saveMoment', () => {
    it('uploads new photos under the moment, then writes the document', async () => {
        const progress = vi.fn();
        const saved = await saveMoment('u', null, {
            title: '  Đi chơi Ueno ', date: '2026-11-05', note: 'vui', keptPhotos: [], newFiles: [image(), image('b.jpg')]
        }, progress);

        expect(uploadBytesResumable).toHaveBeenCalledTimes(2);
        const [firstRef, , metadata] = (uploadBytesResumable as Mock).mock.calls[0];
        expect(firstRef.path).toMatch(new RegExp(`^users/u/moments/${saved.id}/[^/]+\\.jpg$`));
        expect(metadata).toEqual({ contentType: 'image/jpeg' });
        expect(progress).toHaveBeenCalledWith(1, 2, 0.5);
        expect(saved).toMatchObject({ title: 'Đi chơi Ueno', date: '2026-11-05', note: 'vui' });
        expect(saved.photos).toHaveLength(2);
        expect(setDoc).toHaveBeenCalledWith(
            expect.objectContaining({ path: `users/u/moments/${saved.id}` }),
            expect.not.objectContaining({ id: expect.anything() })
        );
    });

    it('keeps chosen photos, deletes removed ones after saving', async () => {
        const existing = moment('m1', '2026-11-05', '2026-11-05T08:00:00Z', [photo('keep'), photo('drop')]);
        const saved = await saveMoment('u', existing, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [photo('keep')], newFiles: [] });

        expect(saved.photos.map((p) => p.id)).toEqual(['keep']);
        expect(saved.createdAt).toBe('2026-11-05T08:00:00Z');
        expect(deleteObject).toHaveBeenCalledTimes(1);
        expect(deleteObject).toHaveBeenCalledWith({ path: 'users/u/moments/m1/drop.jpg' });
    });

    it('saves nothing when Storage is not enabled', async () => {
        (uploadBytesResumable as Mock).mockImplementation(() => fakeTask({ code: 'storage/bucket-not-found' }));
        await expect(saveMoment('u', null, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [image()] }))
            .rejects.toMatchObject({ code: 'storage-disabled' });
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('rejects files that are not images', async () => {
        await expect(saveMoment('u', null, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] }))
            .rejects.toMatchObject({ code: 'not-image' });
        expect(uploadBytesResumable).not.toHaveBeenCalled();
    });
});

describe('deleteMoment', () => {
    it('removes the document and every photo file, ignoring files already gone', async () => {
        (deleteObject as Mock).mockRejectedValueOnce({ code: 'storage/object-not-found' });
        await deleteMoment('u', moment('m1', '2026-11-05', '2026-11-05T08:00:00Z', [photo('a'), photo('b')]));
        expect(deleteDoc).toHaveBeenCalledWith({ id: 'm1', path: 'users/u/moments/m1' });
        expect(deleteObject).toHaveBeenCalledTimes(2);
    });
});
