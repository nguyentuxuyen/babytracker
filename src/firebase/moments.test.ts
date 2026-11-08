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
vi.mock('./config', () => ({ db: {}, auth: {} }));
vi.mock('./googleDrive', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./googleDrive')>();
    let fileId = 0;
    return {
        ...actual,
        createMomentFolder: vi.fn(async () => 'folder-1'),
        renameDriveFile: vi.fn(async () => undefined),
        trashDriveFile: vi.fn(async () => undefined),
        uploadToDrive: vi.fn(async (_blob: unknown, _name: string, _parent: string, onProgress?: (f: number) => void) => {
            onProgress?.(0.5);
            fileId += 1;
            return `file-${fileId}`;
        })
    };
});
vi.mock('../utils/imageCompress', () => ({
    compressImage: vi.fn(async () => ({ blob: { size: 300_000 }, width: 1600, height: 1200 }))
}));

import { deleteDoc, setDoc } from 'firebase/firestore';
import { DriveError, createMomentFolder, renameDriveFile, trashDriveFile, uploadToDrive } from './googleDrive';
import {
    Moment,
    MomentPhoto,
    deleteMoment,
    groupMomentsByMonth,
    momentPlaces,
    normalizeMoment,
    saveMoment,
    sortMoments,
    toLocalDateKey,
    toMomentError
} from './moments';

const photo = (id: string): MomentPhoto => ({ id, driveFileId: `drive-${id}`, width: 1, height: 1, size: 1, place: null, takenAt: null });
const moment = (id: string, date: string, createdAt = '2026-11-01T00:00:00Z', photos = [photo(`${id}-p`)], driveFolderId: string | null = null): Moment => ({
    id, date, createdAt, title: id, note: '', photos, driveFolderId, location: null, updatedAt: createdAt
});

const image = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
    vi.clearAllMocks();
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

    it('maps Drive connection errors', () => {
        expect(toMomentError(new DriveError('not-connected')).code).toBe('drive-not-connected');
        expect(toMomentError(new DriveError('not-configured')).code).toBe('drive-not-configured');
        expect(toMomentError(new DriveError('failed')).code).toBe('failed');
    });

    it('reads a valid location and drops a broken one', () => {
        expect(normalizeMoment('a', { date: '2026-11-05', location: { lat: 35.7, lng: 139.7, name: 'Ueno', source: 'photo' } })?.location)
            .toEqual({ lat: 35.7, lng: 139.7, name: 'Ueno', source: 'photo' });
        expect(normalizeMoment('a', { date: '2026-11-05', location: { lat: 'x', lng: 1 } })?.location).toBeNull();
        expect(normalizeMoment('a', { date: '2026-11-05' })?.location).toBeNull();
    });

    it('reads the Drive folder and ignores photos without a Drive file', () => {
        expect(normalizeMoment('a', { date: '2026-11-05', driveFolderId: 'f', photos: [{ id: 'old', url: 'https://x' }, photo('ok')] }))
            .toMatchObject({ driveFolderId: 'f', photos: [{ id: 'ok', driveFileId: 'drive-ok' }] });
    });
});

describe('photo places', () => {
    it('reads each photo place and capture time, older photos have none', () => {
        const read = normalizeMoment('a', { date: '2026-11-05', photos: [
            { ...photo('p1'), place: { lat: 35.5, lng: 139.6, name: ' Tsurumi ' }, takenAt: '2025-06-14T10:00:00' },
            { id: 'old', driveFileId: 'd-old', width: 1, height: 1, size: 1 },
            { ...photo('bad'), place: { lat: 'x' }, takenAt: 'yesterday' }
        ] })!;
        expect(read.photos.map((p) => [p.place, p.takenAt])).toEqual([
            [{ lat: 35.5, lng: 139.6, name: 'Tsurumi' }, '2025-06-14T10:00:00'],
            [null, null],
            [null, null]
        ]);
    });

    it('lists distinct named places, the moment place first', () => {
        const home = { lat: 35.5, lng: 139.6, name: 'Nhà' };
        const near = { lat: 35.501, lng: 139.601, name: 'Gần nhà' };
        const hospital = { lat: 35.6, lng: 139.7, name: 'Bệnh viện' };
        const m = moment('m', '2026-11-05', undefined, [
            { ...photo('1'), place: hospital }, { ...photo('2'), place: near }, { ...photo('3'), place: home }
        ]);
        expect(momentPlaces(m).map((p) => p.name)).toEqual(['Bệnh viện', 'Gần nhà']);
        expect(momentPlaces({ ...m, location: { ...home, source: 'photo' } }).map((p) => p.name)).toEqual(['Nhà', 'Bệnh viện']);
    });
});

describe('saveMoment', () => {
    it('stores each new photo with its own place and time', async () => {
        const place = { lat: 35.5, lng: 139.6, name: 'Tsurumi' };
        const saved = await saveMoment('u', null, {
            title: 'x', date: '2025-06-14', note: '', keptPhotos: [], newFiles: [image(), image('b.jpg')],
            newFileInfo: [{ place, takenAt: '2025-06-14T10:00:00' }]
        });
        expect(saved.photos.map((p) => [p.place, p.takenAt])).toEqual([[place, '2025-06-14T10:00:00'], [null, null]]);
    });

    it('creates a Drive folder for the moment, uploads into it, then writes the document', async () => {
        const progress = vi.fn();
        const saved = await saveMoment('u', null, {
            title: '  Đi chơi Ueno ', date: '2026-11-05', note: 'vui', keptPhotos: [], newFiles: [image(), image('b.jpg')]
        }, progress);

        expect(createMomentFolder).toHaveBeenCalledWith('2026-11-05 Đi chơi Ueno');
        expect(uploadToDrive).toHaveBeenCalledTimes(2);
        expect((uploadToDrive as Mock).mock.calls[0][2]).toBe('folder-1');
        expect((uploadToDrive as Mock).mock.calls[1][1]).toMatch(/-2\.jpg$/);
        expect(progress).toHaveBeenCalledWith(1, 2, 0.5);
        expect(saved).toMatchObject({ title: 'Đi chơi Ueno', date: '2026-11-05', note: 'vui', driveFolderId: 'folder-1' });
        expect(saved.photos.map((p) => p.driveFileId)).toEqual([expect.stringMatching(/^file-/), expect.stringMatching(/^file-/)]);
        expect(setDoc).toHaveBeenCalledWith(
            expect.objectContaining({ path: `users/u/moments/${saved.id}` }),
            expect.not.objectContaining({ id: expect.anything() })
        );
    });

    it('saves the place (trimmed) and keeps the old one when not given', async () => {
        const location = { lat: 35.71, lng: 139.77, name: '  Công viên Ueno ', source: 'photo' as const };
        const saved = await saveMoment('u', null, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [], location });
        expect(saved.location).toEqual({ ...location, name: 'Công viên Ueno' });
        const again = await saveMoment('u', saved, { title: 'y', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [] });
        expect(again.location).toEqual(saved.location);
        const cleared = await saveMoment('u', saved, { title: 'y', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [], location: null });
        expect(cleared.location).toBeNull();
    });

    it('needs no Drive at all for a moment without photos', async () => {
        const saved = await saveMoment('u', null, { title: 'Lần đầu lật', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [] });
        expect(createMomentFolder).not.toHaveBeenCalled();
        expect(saved.driveFolderId).toBeNull();
    });

    it('keeps chosen photos, trashes removed ones and renames the folder', async () => {
        const existing = moment('m1', '2026-11-05', '2026-11-05T08:00:00Z', [photo('keep'), photo('drop')], 'folder-9');
        const saved = await saveMoment('u', existing, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [photo('keep')], newFiles: [image()] });

        expect(createMomentFolder).not.toHaveBeenCalled();
        expect(renameDriveFile).toHaveBeenCalledWith('folder-9', '2026-11-05 x');
        expect((uploadToDrive as Mock).mock.calls[0][2]).toBe('folder-9');
        expect(saved.photos.map((p) => p.id)[0]).toBe('keep');
        expect(saved.createdAt).toBe('2026-11-05T08:00:00Z');
        expect(trashDriveFile).toHaveBeenCalledTimes(1);
        expect(trashDriveFile).toHaveBeenCalledWith('drive-drop');
    });

    it('saves nothing when Google Drive is not connected', async () => {
        (createMomentFolder as Mock).mockRejectedValueOnce(new DriveError('not-connected'));
        await expect(saveMoment('u', null, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [image()] }))
            .rejects.toMatchObject({ code: 'drive-not-connected' });
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('rejects files that are not images', async () => {
        await expect(saveMoment('u', null, { title: 'x', date: '2026-11-05', note: '', keptPhotos: [], newFiles: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] }))
            .rejects.toMatchObject({ code: 'not-image' });
        expect(uploadToDrive).not.toHaveBeenCalled();
    });
});

describe('deleteMoment', () => {
    it('removes the document and moves the moment folder to the Drive trash', async () => {
        await deleteMoment('u', moment('m1', '2026-11-05', '2026-11-05T08:00:00Z', [photo('a'), photo('b')], 'folder-9'));
        expect(deleteDoc).toHaveBeenCalledWith({ id: 'm1', path: 'users/u/moments/m1' });
        expect(trashDriveFile).toHaveBeenCalledTimes(1);
        expect(trashDriveFile).toHaveBeenCalledWith('folder-9');
    });

    it('still deletes the document when the trash call fails', async () => {
        (trashDriveFile as Mock).mockRejectedValueOnce(new Error('offline'));
        await deleteMoment('u', moment('m1', '2026-11-05', '2026-11-05T08:00:00Z', [photo('a')]));
        expect(deleteDoc).toHaveBeenCalled();
        expect(trashDriveFile).toHaveBeenCalledWith('drive-a');
    });
});
