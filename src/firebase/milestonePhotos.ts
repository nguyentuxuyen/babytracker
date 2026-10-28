// Milestone photos: the image file lives in Cloud Storage, the metadata in Firestore at
// users/{uid}/milestonePhotos/{photoId}. The milestones document itself stays small.
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

export const MAX_PHOTOS_PER_PICK = 10;

export interface MilestonePhoto {
    id: string;
    milestoneId: string;
    storagePath: string;
    url: string;
    width: number;
    height: number;
    size: number;
    createdAt: string;
}

export type MilestonePhotoErrorCode = 'storage-disabled' | 'not-image' | 'too-large' | 'failed';

export class MilestonePhotoError extends Error {
    code: MilestonePhotoErrorCode;
    constructor(code: MilestonePhotoErrorCode, message?: string) {
        super(message || code);
        this.code = code;
    }
}

// Firebase Storage error codes when the bucket does not exist yet or rules are not deployed.
const STORAGE_DISABLED_CODES = ['storage/bucket-not-found', 'storage/project-not-found', 'storage/unauthorized', 'storage/unknown'];

export const toPhotoError = (error: unknown): MilestonePhotoError => {
    if (error instanceof MilestonePhotoError) return error;
    const code = (error as { code?: string } | null)?.code || '';
    if (STORAGE_DISABLED_CODES.includes(code)) return new MilestonePhotoError('storage-disabled', code);
    return new MilestonePhotoError('failed', code || String(error));
};

const photosCollection = (uid: string) => collection(db, 'users', uid, 'milestonePhotos');

export const normalizeMilestonePhoto = (id: string, data: Record<string, unknown>): MilestonePhoto | null => {
    if (typeof data.milestoneId !== 'string' || typeof data.url !== 'string' || typeof data.storagePath !== 'string') {
        return null;
    }
    return {
        id,
        milestoneId: data.milestoneId,
        storagePath: data.storagePath,
        url: data.url,
        width: Number(data.width) || 0,
        height: Number(data.height) || 0,
        size: Number(data.size) || 0,
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : ''
    };
};

export const groupPhotosByMilestone = (photos: MilestonePhoto[]): Record<string, MilestonePhoto[]> => {
    const grouped: Record<string, MilestonePhoto[]> = {};
    photos.forEach((photo) => {
        (grouped[photo.milestoneId] ||= []).push(photo);
    });
    Object.values(grouped).forEach((list) => list.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    return grouped;
};

export const subscribeMilestonePhotos = (
    uid: string,
    onChange: (photos: MilestonePhoto[]) => void,
    onError?: (error: unknown) => void
) => onSnapshot(
    query(photosCollection(uid), orderBy('createdAt', 'asc')),
    (snapshot) => onChange(snapshot.docs
        .map((item) => normalizeMilestonePhoto(item.id, item.data()))
        .filter((item): item is MilestonePhoto => item !== null)),
    onError
);

export const uploadMilestonePhoto = async (
    uid: string,
    milestoneId: string,
    file: File,
    onProgress?: (fraction: number) => void
): Promise<MilestonePhoto> => {
    if (!file.type.startsWith('image/')) throw new MilestonePhotoError('not-image');

    let compressed;
    try {
        compressed = await compressImage(file);
    } catch {
        throw new MilestonePhotoError('not-image');
    }
    // storage.rules rejects anything above 5 MB; a 1600px JPEG is normally 200-500 KB.
    if (compressed.blob.size > 5 * 1024 * 1024) throw new MilestonePhotoError('too-large');

    const photoRef = doc(photosCollection(uid));
    const storagePath = `users/${uid}/milestonePhotos/${photoRef.id}.jpg`;
    const objectRef = ref(storage, storagePath);

    try {
        const task = uploadBytesResumable(objectRef, compressed.blob, {
            contentType: 'image/jpeg',
            customMetadata: { milestoneId }
        });
        await new Promise<void>((resolve, reject) => {
            task.on(
                'state_changed',
                (snapshot) => onProgress?.(snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0),
                reject,
                () => resolve()
            );
        });
        const url = await getDownloadURL(objectRef);
        const photo: MilestonePhoto = {
            id: photoRef.id,
            milestoneId,
            storagePath,
            url,
            width: compressed.width,
            height: compressed.height,
            size: compressed.blob.size,
            createdAt: new Date().toISOString()
        };
        const { id: _id, ...data } = photo;
        await setDoc(photoRef, data);
        return photo;
    } catch (error) {
        throw toPhotoError(error);
    }
};

export const deleteMilestonePhoto = async (uid: string, photo: MilestonePhoto) => {
    await deleteDoc(doc(photosCollection(uid), photo.id));
    try {
        await deleteObject(ref(storage, photo.storagePath));
    } catch (error) {
        // The metadata is gone, so the photo no longer shows; an orphaned file is harmless.
        if ((error as { code?: string })?.code !== 'storage/object-not-found') {
            console.warn('Could not delete photo file', error);
        }
    }
};
