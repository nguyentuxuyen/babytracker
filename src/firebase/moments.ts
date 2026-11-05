// Moments ("Khoảnh khắc"): a free-form event such as a day out, with photos and a note.
// Metadata lives at users/{uid}/moments/{momentId}; the photo files in the user's own
// Google Drive, one subfolder per moment inside the app's folder (see googleDrive.ts).
import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    setDoc
} from 'firebase/firestore';
import { db } from './config';
import { compressImage } from '../utils/imageCompress';
import {
    DriveError,
    createMomentFolder,
    momentFolderName,
    renameDriveFile,
    trashDriveFile,
    uploadToDrive
} from './googleDrive';

export const MAX_PHOTOS_PER_MOMENT = 30;
export const MAX_PHOTOS_PER_PICK = 10;

export interface MomentPhoto {
    id: string;
    driveFileId: string;
    width: number;
    height: number;
    size: number;
}

export interface Moment {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD, local date of the event
    note: string;
    photos: MomentPhoto[];
    driveFolderId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface MomentInput {
    title: string;
    date: string;
    note: string;
    keptPhotos: MomentPhoto[];
    newFiles: File[];
}

export type MomentErrorCode = 'drive-not-connected' | 'drive-not-configured' | 'not-image' | 'too-large' | 'failed';

export class MomentError extends Error {
    code: MomentErrorCode;
    constructor(code: MomentErrorCode, message?: string) {
        super(message || code);
        this.code = code;
    }
}

export const toMomentError = (error: unknown): MomentError => {
    if (error instanceof MomentError) return error;
    if (error instanceof DriveError) {
        if (error.code === 'not-connected') return new MomentError('drive-not-connected', error.message);
        if (error.code === 'not-configured') return new MomentError('drive-not-configured', error.message);
    }
    const code = (error as { code?: string } | null)?.code || '';
    return new MomentError('failed', code || String(error));
};

export const toLocalDateKey = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const momentsCollection = (uid: string) => collection(db, 'users', uid, 'moments');

const normalizePhoto = (raw: any): MomentPhoto | null => {
    if (!raw || typeof raw.id !== 'string' || typeof raw.driveFileId !== 'string' || !raw.driveFileId) return null;
    return {
        id: raw.id,
        driveFileId: raw.driveFileId,
        width: Number(raw.width) || 0,
        height: Number(raw.height) || 0,
        size: Number(raw.size) || 0
    };
};

export const normalizeMoment = (id: string, data: Record<string, unknown>): Moment | null => {
    if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return null;
    return {
        id,
        title: typeof data.title === 'string' ? data.title : '',
        date: data.date,
        note: typeof data.note === 'string' ? data.note : '',
        photos: Array.isArray(data.photos)
            ? data.photos.map(normalizePhoto).filter((photo): photo is MomentPhoto => photo !== null)
            : [],
        driveFolderId: typeof data.driveFolderId === 'string' ? data.driveFolderId : null,
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : ''
    };
};

// Newest event first; same-day moments in the order they were added.
export const sortMoments = (moments: Moment[]) => [...moments].sort((a, b) =>
    b.date.localeCompare(a.date) || a.createdAt.localeCompare(b.createdAt));

// Groups already-sorted moments by month key "YYYY-MM", keeping the order.
export const groupMomentsByMonth = (moments: Moment[]): Array<[string, Moment[]]> => {
    const groups: Array<[string, Moment[]]> = [];
    moments.forEach((moment) => {
        const month = moment.date.slice(0, 7);
        const last = groups[groups.length - 1];
        if (last && last[0] === month) last[1].push(moment);
        else groups.push([month, [moment]]);
    });
    return groups;
};

export const subscribeMoments = (
    uid: string,
    onChange: (moments: Moment[]) => void,
    onError?: (error: unknown) => void
) => onSnapshot(
    query(momentsCollection(uid), orderBy('date', 'desc')),
    (snapshot) => onChange(sortMoments(snapshot.docs
        .map((item) => normalizeMoment(item.id, item.data()))
        .filter((item): item is Moment => item !== null))),
    onError
);

const uploadPhoto = async (
    folderId: string,
    index: number,
    file: File,
    onProgress?: (fraction: number) => void
): Promise<MomentPhoto> => {
    if (!file.type.startsWith('image/')) throw new MomentError('not-image');
    let compressed;
    try {
        compressed = await compressImage(file);
    } catch {
        throw new MomentError('not-image');
    }
    // A 1600px JPEG is normally 200-500 KB; anything far above that is not a normal photo.
    if (compressed.blob.size > 5 * 1024 * 1024) throw new MomentError('too-large');

    // A Firestore auto-id is only used as a unique photo id; nothing is written there.
    const photoId = doc(collection(db, '_ids')).id;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
    try {
        const driveFileId = await uploadToDrive(compressed.blob, `${stamp}-${index + 1}.jpg`, folderId, onProgress);
        return { id: photoId, driveFileId, width: compressed.width, height: compressed.height, size: compressed.blob.size };
    } catch (error) {
        throw toMomentError(error);
    }
};

// Deleted photos go to the Drive trash; failing here only leaves a file in Drive.
const trashQuietly = async (fileIds: string[]) => {
    await Promise.all(fileIds.map(async (fileId) => {
        try {
            await trashDriveFile(fileId);
        } catch (error) {
            console.warn('Could not move photo to Drive trash', error);
        }
    }));
};

/**
 * Creates or updates a moment. New files are uploaded one by one into the moment's Drive
 * folder (onProgress gets done/total and the current file's fraction); photos dropped from
 * `keptPhotos` are moved to the Drive trash after the document is saved.
 */
export const saveMoment = async (
    uid: string,
    existing: Moment | null,
    input: MomentInput,
    onProgress?: (done: number, total: number, fraction: number) => void
): Promise<Moment> => {
    const momentRef = existing ? doc(momentsCollection(uid), existing.id) : doc(momentsCollection(uid));
    const title = input.title.trim();
    const folderName = momentFolderName(input.date, title);
    let driveFolderId = existing?.driveFolderId || null;

    try {
        if (input.newFiles.length && !driveFolderId) driveFolderId = await createMomentFolder(folderName);
        else if (driveFolderId && existing && (existing.title !== title || existing.date !== input.date)) {
            await renameDriveFile(driveFolderId, folderName).catch((error) => console.warn('Could not rename Drive folder', error));
        }
    } catch (error) {
        throw toMomentError(error);
    }

    const uploaded: MomentPhoto[] = [];
    for (let i = 0; i < input.newFiles.length; i += 1) {
        onProgress?.(i, input.newFiles.length, 0);
        uploaded.push(await uploadPhoto(driveFolderId as string, input.keptPhotos.length + i, input.newFiles[i], (fraction) =>
            onProgress?.(i, input.newFiles.length, fraction)));
    }

    const now = new Date().toISOString();
    const moment: Moment = {
        id: momentRef.id,
        title,
        date: input.date,
        note: input.note.trim(),
        photos: [...input.keptPhotos, ...uploaded],
        driveFolderId,
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };
    const { id: _id, ...data } = moment;
    await setDoc(momentRef, data);

    if (existing) {
        const keptIds = new Set(input.keptPhotos.map((photo) => photo.id));
        await trashQuietly(existing.photos.filter((photo) => !keptIds.has(photo.id)).map((photo) => photo.driveFileId));
    }
    return moment;
};

// The whole moment folder goes to the Drive trash (photos included), restorable for 30 days.
export const deleteMoment = async (uid: string, moment: Moment) => {
    await deleteDoc(doc(momentsCollection(uid), moment.id));
    await trashQuietly(moment.driveFolderId ? [moment.driveFolderId] : moment.photos.map((photo) => photo.driveFileId));
};
