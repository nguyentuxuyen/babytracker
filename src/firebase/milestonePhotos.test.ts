import type { Mock } from 'vitest';

vi.mock('firebase/firestore', () => ({
    collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
    doc: vi.fn((parent: any, ...segments: string[]) => (segments.length
        ? { id: segments[segments.length - 1], path: `${parent.path}/${segments.join('/')}` }
        : { id: 'photo-1', path: `${parent.path}/photo-1` })),
    setDoc: vi.fn(async () => undefined),
    deleteDoc: vi.fn(async () => undefined),
    onSnapshot: vi.fn(),
    orderBy: vi.fn(),
    query: vi.fn()
}));
vi.mock('firebase/storage', () => ({
    ref: vi.fn((_storage: unknown, path: string) => ({ path })),
    uploadBytesResumable: vi.fn(),
    getDownloadURL: vi.fn(async () => 'https://example.test/photo.jpg'),
    deleteObject: vi.fn(async () => undefined)
}));
vi.mock('./config', () => ({ db: {}, storage: {} }));
vi.mock('../utils/imageCompress', () => ({
    compressImage: vi.fn(async () => ({ blob: { size: 300_000 }, width: 1600, height: 1200 }))
}));

import { deleteDoc, setDoc } from 'firebase/firestore';
import { deleteObject, uploadBytesResumable } from 'firebase/storage';
import {
    MilestonePhoto,
    deleteMilestonePhoto,
    groupPhotosByMilestone,
    normalizeMilestonePhoto,
    toPhotoError,
    uploadMilestonePhoto
} from './milestonePhotos';

const photo = (id: string, milestoneId: string, createdAt: string): MilestonePhoto => ({
    id, milestoneId, createdAt, storagePath: `users/u/milestonePhotos/${id}.jpg`, url: `https://x/${id}`, width: 1, height: 1, size: 1
});

// Fake upload task that reports one progress event and then completes (or fails).
const fakeTask = (failWith?: unknown) => ({
    on: (_event: string, progress: (s: any) => void, error: (e: unknown) => void, done: () => void) => {
        progress({ bytesTransferred: 50, totalBytes: 100 });
        if (failWith) error(failWith); else done();
    }
});

const imageFile = () => new File(['x'], 'baby.jpg', { type: 'image/jpeg' });

beforeEach(() => {
    vi.clearAllMocks();
});

describe('milestone photo helpers', () => {
    it('drops documents without the required fields', () => {
        expect(normalizeMilestonePhoto('a', { milestoneId: '13-1' })).toBeNull();
        expect(normalizeMilestonePhoto('a', { milestoneId: '13-1', url: 'u', storagePath: 'p', width: '800' }))
            .toMatchObject({ id: 'a', width: 800, height: 0, createdAt: '' });
    });

    it('groups photos per milestone, oldest first', () => {
        const grouped = groupPhotosByMilestone([
            photo('b', '13-1', '2026-10-02'),
            photo('c', '14-2', '2026-10-01'),
            photo('a', '13-1', '2026-10-01')
        ]);
        expect(grouped['13-1'].map((p) => p.id)).toEqual(['a', 'b']);
        expect(grouped['14-2'].map((p) => p.id)).toEqual(['c']);
    });

    it('maps missing-bucket and permission errors to storage-disabled', () => {
        expect(toPhotoError({ code: 'storage/bucket-not-found' }).code).toBe('storage-disabled');
        expect(toPhotoError({ code: 'storage/unauthorized' }).code).toBe('storage-disabled');
        expect(toPhotoError({ code: 'storage/retry-limit-exceeded' }).code).toBe('failed');
    });
});

describe('uploadMilestonePhoto', () => {
    it('uploads the compressed JPEG, then writes the metadata', async () => {
        (uploadBytesResumable as Mock).mockReturnValue(fakeTask());
        const progress = vi.fn();

        const result = await uploadMilestonePhoto('u', '13-1', imageFile(), progress);

        expect(uploadBytesResumable).toHaveBeenCalledWith(
            { path: 'users/u/milestonePhotos/photo-1.jpg' },
            { size: 300_000 },
            { contentType: 'image/jpeg', customMetadata: { milestoneId: '13-1' } }
        );
        expect(progress).toHaveBeenCalledWith(0.5);
        expect(setDoc).toHaveBeenCalledWith(
            { id: 'photo-1', path: 'users/u/milestonePhotos/photo-1' },
            expect.objectContaining({ milestoneId: '13-1', url: 'https://example.test/photo.jpg', width: 1600, height: 1200, size: 300_000 })
        );
        expect(result.id).toBe('photo-1');
    });

    it('rejects files that are not images without uploading', async () => {
        await expect(uploadMilestonePhoto('u', '13-1', new File(['x'], 'a.pdf', { type: 'application/pdf' })))
            .rejects.toMatchObject({ code: 'not-image' });
        expect(uploadBytesResumable).not.toHaveBeenCalled();
    });

    it('does not write metadata when Storage is not enabled', async () => {
        (uploadBytesResumable as Mock).mockReturnValue(fakeTask({ code: 'storage/bucket-not-found' }));
        await expect(uploadMilestonePhoto('u', '13-1', imageFile())).rejects.toMatchObject({ code: 'storage-disabled' });
        expect(setDoc).not.toHaveBeenCalled();
    });
});

describe('deleteMilestonePhoto', () => {
    it('removes the metadata and the file, ignoring a file that is already gone', async () => {
        (deleteObject as Mock).mockRejectedValueOnce({ code: 'storage/object-not-found' });
        await deleteMilestonePhoto('u', photo('a', '13-1', '2026-10-01'));
        expect(deleteDoc).toHaveBeenCalledWith({ id: 'a', path: 'users/u/milestonePhotos/a' });
        expect(deleteObject).toHaveBeenCalledWith({ path: 'users/u/milestonePhotos/a.jpg' });
    });
});
