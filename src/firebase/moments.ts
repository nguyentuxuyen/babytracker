// Moments ("Khoảnh khắc"): a free-form event such as a day out, with photos and a note.
// Metadata lives at users/{uid}/moments/{momentId}; each photo file in Cloud Storage at
// users/{uid}/moments/{momentId}/{photoId}.jpg.
import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    setDoc
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { db, storage } from './config';
import { compressImage } from '../utils/imageCompress';

export const MAX_PHOTOS_PER_MOMENT = 30;
export const MAX_PHOTOS_PER_PICK = 10;

export interface MomentPhoto {
    id: string;
    storagePath: string;
    url: string;
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

export type MomentErrorCode = 'storage-disabled' | 'not-image' | 'too-large' | 'failed';

export class MomentError extends Error {
    code: MomentErrorCode;
    constructor(code: MomentErrorCode, message?: string) {
        super(message || code);
        this.code = code;
    }
}

// Firebase Storage error codes when the bucket does not exist yet or rules are not deployed.
const STORAGE_DISABLED_CODES = ['storage/bucket-not-found', 'storage/project-not-found', 'storage/unauthorized', 'storage/unknown'];

export const toMomentError = (error: unknown): MomentError => {
    if (error instanceof MomentError) return error;
    const code = (error as { code?: string } | null)?.code || '';
    if (STORAGE_DISABLED_CODES.includes(code)) return new MomentError('storage-disabled', code);
    return new MomentError('failed', code || String(error));
};

export const toLocalDateKey = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const momentsCollection = (uid: string) => collection(db, 'users', uid, 'moments');

const normalizePhoto = (raw: any): MomentPhoto | null => {
    if (!raw || typeof raw.id !== 'string' || typeof raw.url !== 'string' || typeof raw.storagePath !== 'string') return null;
    return {
        id: raw.id,
        storagePath: raw.storagePath,
        url: raw.url,
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
    uid: string,
    momentId: string,
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
    // storage.rules rejects anything above 5 MB; a 1600px JPEG is normally 200-500 KB.
    if (compressed.blob.size > 5 * 1024 * 1024) throw new MomentError('too-large');

    // A Firestore auto-id is only used as a unique file name; nothing is written there.
    const photoId = doc(collection(db, 'users', uid, 'moments', momentId, 'photoIds')).id;
    const storagePath = `users/${uid}/moments/${momentId}/${photoId}.jpg`;
    const objectRef = ref(storage, storagePath);
    try {
        const task = uploadBytesResumable(objectRef, compressed.blob, { contentType: 'image/jpeg' });
        await new Promise<void>((resolve, reject) => {
            task.on(
                'state_changed',
                (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
                reject,
                () => resolve()
            );
        });
        return {
            id: photoId,
            storagePath,
            url: await getDownloadURL(objectRef),
            width: compressed.width,
            height: compressed.height,
            size: compressed.blob.size
        };
    } catch (error) {
        throw toMomentError(error);
    }
};

const deletePhotoFiles = async (photos: MomentPhoto[]) => {
    await Promise.all(photos.map(async (photo) => {
        try {
            await deleteObject(ref(storage, photo.storagePath));
        } catch (error) {
            // The moment no longer lists it, so it never shows; an orphaned file is harmless.
            if ((error as { code?: string })?.code !== 'storage/object-not-found') {
                console.warn('Could not delete photo file', error);
            }
        }
    }));
};

/**
 * Creates or updates a moment. New files are uploaded one by one (onProgress gets
 * done/total and the current file's fraction); photos dropped from `keptPhotos` are
 * deleted from Storage after the document is saved.
 */
export const saveMoment = async (
    uid: string,
    existing: Moment | null,
    input: MomentInput,
    onProgress?: (done: number, total: number, fraction: number) => void
): Promise<Moment> => {
    const momentRef = existing ? doc(momentsCollection(uid), existing.id) : doc(momentsCollection(uid));
    const uploaded: MomentPhoto[] = [];
    for (let i = 0; i < input.newFiles.length; i += 1) {
        onProgress?.(i, input.newFiles.length, 0);
        uploaded.push(await uploadPhoto(uid, momentRef.id, input.newFiles[i], (fraction) =>
            onProgress?.(i, input.newFiles.length, fraction)));
    }

    const now = new Date().toISOString();
    const moment: Moment = {
        id: momentRef.id,
        title: input.title.trim(),
        date: input.date,
        note: input.note.trim(),
        photos: [...input.keptPhotos, ...uploaded],
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };
    const { id: _id, ...data } = moment;
    await setDoc(momentRef, data);

    if (existing) {
        const keptIds = new Set(input.keptPhotos.map((photo) => photo.id));
        await deletePhotoFiles(existing.photos.filter((photo) => !keptIds.has(photo.id)));
    }
    return moment;
};

export const deleteMoment = async (uid: string, moment: Moment) => {
    await deleteDoc(doc(momentsCollection(uid), moment.id));
    await deletePhotoFiles(moment.photos);
};
