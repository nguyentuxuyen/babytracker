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
        updateDoc: vi.fn(async () => undefined),
        deleteDoc: vi.fn(async () => undefined),
        onSnapshot: vi.fn(),
        orderBy: vi.fn(),
        query: vi.fn(),
        writeBatch: vi.fn(() => {
            const batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) };
            batches.push(batch);
            return batch;
        })
    };
});
const batches: Array<{ set: Mock; delete: Mock; commit: Mock }> = vi.hoisted(() => []);
vi.mock('./config', () => ({ db: {}, auth: {} }));
vi.mock('./googleDrive', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./googleDrive')>();
    let fileId = 0;
    return {
        ...actual,
        createMomentFolder: vi.fn(async () => 'folder-1'),
        renameDriveFile: vi.fn(async () => undefined),
        moveDriveFile: vi.fn(async () => undefined),
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

import { deleteDoc, setDoc, updateDoc } from 'firebase/firestore';
import { DriveError, createMomentFolder, moveDriveFile, renameDriveFile, trashDriveFile, uploadToDrive } from './googleDrive';
import {
    Moment,
    MomentPhoto,
    buildMergedMoment,
    deleteMoment,
    groupMomentsByMonth,
    mergeDefaults,
    mergeMoments,
    momentPlaces,
    saveLegModes,
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

describe('leg modes', () => {
    it('reads only known modes and keeps them when the moment is edited', async () => {
        const read = normalizeMoment('a', { date: '2026-11-01', legModes: { 'p1>p2': 'plane', 'p2>p3': 'rocket', 'p3>p4': 'ship' } })!;
        expect(read.legModes).toEqual({ 'p1>p2': 'plane', 'p3>p4': 'ship' });
        const saved = await saveMoment('u', read, { title: 'x', date: '2026-11-01', note: '', keptPhotos: [], newFiles: [] });
        expect(saved.legModes).toEqual(read.legModes);
    });

    it('saves just the modes', async () => {
        await saveLegModes('u', 'm1', { 'a>b': 'train', bad: 'x' as never });
        expect(updateDoc).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/u/moments/m1' }), expect.objectContaining({ legModes: { 'a>b': 'train' } }));
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

describe('merging moments', () => {
    const placed = (id: string, takenAt: string) => ({ ...photo(id), takenAt, place: { lat: 35, lng: 139, name: id } });
    const day1 = { ...moment('a', '2026-08-01', '2026-08-01T10:00:00Z', [placed('a1', '2026-08-01T09:00:00')], 'folder-a'), note: 'Ngày 1', legModes: { x: 'car' as const } };
    const day2 = { ...moment('b', '2026-08-02', '2026-08-02T10:00:00Z', [placed('b1', '2026-08-02T09:00:00'), placed('b2', '2026-08-02T15:00:00')], 'folder-b'), title: '', note: 'Ngày 2' };
    const day3 = { ...moment('c', '2026-08-03', '2026-08-03T10:00:00Z', [placed('c1', '2026-08-03T09:00:00')], 'folder-c'), note: 'Ngày 1' };

    beforeEach(() => {
        batches.length = 0;
        vi.clearAllMocks();
    });

    it('starts from the first title and every distinct note', () => {
        expect(mergeDefaults([day3, day2, day1])).toEqual({ title: 'a', note: 'Ngày 1\n\nNgày 2' });
    });

    it('keeps the oldest moment, its date and every photo in time order', () => {
        const merged = buildMergedMoment([day3, day1, day2], { title: ' Chuyến đi Kyoto ', note: 'Vui' }, 'now');
        expect(merged.id).toBe('a');
        expect(merged.date).toBe('2026-08-01');
        expect(merged.title).toBe('Chuyến đi Kyoto');
        expect(merged.photos.map((item) => item.id)).toEqual(['a1', 'b1', 'b2', 'c1']);
        expect(merged.photos[1].place?.name).toBe('b1');
        expect(merged.photos[1].takenAt).toBe('2026-08-02T09:00:00');
        expect(merged.driveFolderId).toBe('folder-a');
        expect(merged.legModes).toEqual({ x: 'car' });
        expect(merged.createdAt).toBe(day1.createdAt);
    });

    it('moves photos into the kept folder, writes one batch and trashes emptied folders', async () => {
        const merged = await mergeMoments('u1', [day2, day1, day3], { title: 'Kyoto', note: '' });
        expect(moveDriveFile).toHaveBeenCalledTimes(3);
        expect(moveDriveFile).toHaveBeenCalledWith('drive-b1', 'folder-a', 'folder-b');
        expect(renameDriveFile).toHaveBeenCalledWith('folder-a', '2026-08-01 Kyoto');
        expect(batches).toHaveLength(1);
        expect(batches[0].set).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), expect.objectContaining({ title: 'Kyoto', date: '2026-08-01' }));
        expect(batches[0].delete.mock.calls.map(([ref]) => ref.id)).toEqual(['b', 'c']);
        expect(trashDriveFile).toHaveBeenCalledWith('folder-b');
        expect(trashDriveFile).toHaveBeenCalledWith('folder-c');
        expect(merged.photos).toHaveLength(4);
    });

    it('keeps an old folder when one of its photos could not be moved', async () => {
        (moveDriveFile as Mock).mockImplementation(async (fileId: string) => {
            if (fileId === 'drive-b2') throw new DriveError('failed');
        });
        await mergeMoments('u1', [day1, day2], { title: 'a', note: '' });
        expect(trashDriveFile).not.toHaveBeenCalled();
        expect(batches[0].commit).toHaveBeenCalled();
        (moveDriveFile as Mock).mockImplementation(async () => undefined);
    });

    it('refuses more photos than one moment holds, and fewer than two moments', async () => {
        const big = { ...day2, photos: Array.from({ length: 30 }, (_, i) => photo(`p${i}`)) };
        await expect(mergeMoments('u1', [day1, big], { title: '', note: '' })).rejects.toThrow('too many photos');
        await expect(mergeMoments('u1', [day1], { title: '', note: '' })).rejects.toThrow();
        expect(batches).toHaveLength(0);
        expect(moveDriveFile).not.toHaveBeenCalled();
    });
});
