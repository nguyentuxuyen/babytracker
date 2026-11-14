// Moments ("Khoảnh khắc"): a free-form event such as a day out, with photos and a note.
// Metadata lives at users/{uid}/moments/{momentId}; the photo files in the user's own
// Google Drive, one subfolder per moment inside the app's folder (see googleDrive.ts).
import {
    collection,
    deleteDoc,
    updateDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    setDoc,
    writeBatch
} from 'firebase/firestore';
import { db } from './config';
import { compressImage } from '../utils/imageCompress';
import { isImageFile } from '../utils/photoExif';
import { distinctPlaces, samePlace } from '../utils/geo';
import {
    DriveError,
    createMomentFolder,
    momentFolderName,
    moveDriveFile,
    renameDriveFile,
    trashDriveFile,
    uploadToDrive
} from './googleDrive';

export const MAX_PHOTOS_PER_MOMENT = 30;

/** Where one photo was taken (from its GPS), with the looked-up place name. */
export interface PhotoPlace {
    lat: number;
    lng: number;
    name: string;
}

export interface MomentPhoto {
    id: string;
    driveFileId: string;
    width: number;
    height: number;
    size: number;
    /** Photos of one moment can come from different places; null when the photo had no GPS. */
    place: PhotoPlace | null;
    /** Local capture time "YYYY-MM-DDTHH:MM:SS" from the photo, when known. */
    takenAt: string | null;
}

/** What is known about a new photo before it is uploaded. */
export interface NewPhotoInfo {
    place: PhotoPlace | null;
    takenAt: string | null;
}

// Where the moment happened: from the photos' GPS or picked by hand. `name` is editable.
export interface MomentLocation {
    lat: number;
    lng: number;
    name: string;
    source: 'photo' | 'search' | 'manual';
}

export interface Moment {
    id: string;
    title: string;
    date: string; // YYYY-MM-DD, local date of the event
    note: string;
    photos: MomentPhoto[];
    driveFolderId: string | null;
    location: MomentLocation | null;
    /** How each leg of the journey was travelled, by legKey (see utils/journey.ts). */
    legModes?: Record<string, TravelMode>;
    createdAt: string;
    updatedAt: string;
}

export interface MomentInput {
    title: string;
    date: string;
    note: string;
    keptPhotos: MomentPhoto[];
    newFiles: File[];
    /** Same order as newFiles; missing entries mean nothing is known. */
    newFileInfo?: Array<NewPhotoInfo | null | undefined>;
    location?: MomentLocation | null;
}

export type MomentErrorCode = 'drive-not-connected' | 'drive-not-configured' | 'drive-api-disabled' | 'not-image' | 'too-large' | 'failed';

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
        if (error.code === 'api-disabled') return new MomentError('drive-api-disabled', error.message);
        return new MomentError('failed', error.message);
    }
    // e.g. Firestore "permission-denied" or a network error: keep it so the user can report it.
    const code = (error as { code?: string } | null)?.code || '';
    const message = (error as { message?: string } | null)?.message || String(error);
    return new MomentError('failed', [code, message].filter(Boolean).join(': ').slice(0, 160));
};

export const TRAVEL_MODES = ['car', 'train', 'plane', 'ship', 'walk'] as const;
export type TravelMode = typeof TRAVEL_MODES[number];

const normalizeLegModes = (raw: any): Record<string, TravelMode> => {
    if (!raw || typeof raw !== 'object') return {};
    const modes: Record<string, TravelMode> = {};
    Object.entries(raw).forEach(([key, mode]) => {
        if (typeof key === 'string' && key.length <= 100 && (TRAVEL_MODES as readonly string[]).includes(mode as string)) modes[key] = mode as TravelMode;
    });
    return modes;
};

/** Saves how the journey's legs were travelled (only that field changes). */
export const saveLegModes = async (uid: string, momentId: string, legModes: Record<string, TravelMode>) => {
    await updateDoc(doc(momentsCollection(uid), momentId), { legModes: normalizeLegModes(legModes), updatedAt: new Date().toISOString() });
};

export const toLocalDateKey = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const momentsCollection = (uid: string) => collection(db, 'users', uid, 'moments');

export const normalizePhotoPlace = (raw: any): PhotoPlace | null => {
    if (!raw || typeof raw !== 'object') return null;
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng, name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 120) : '' };
};

const normalizePhoto = (raw: any): MomentPhoto | null => {
    if (!raw || typeof raw.id !== 'string' || typeof raw.driveFileId !== 'string' || !raw.driveFileId) return null;
    return {
        id: raw.id,
        driveFileId: raw.driveFileId,
        width: Number(raw.width) || 0,
        height: Number(raw.height) || 0,
        size: Number(raw.size) || 0,
        place: normalizePhotoPlace(raw.place),
        takenAt: typeof raw.takenAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw.takenAt) ? raw.takenAt : null
    };
};

/** Distinct named places of a moment's photos (within 1 km counts as one), in photo order. */
export const momentPlaces = (moment: Pick<Moment, 'photos' | 'location'>): PhotoPlace[] => {
    const places = distinctPlaces(moment.photos.map((photo) => photo.place)).filter((place) => place.name);
    if (moment.location?.name) {
        const main = { lat: moment.location.lat, lng: moment.location.lng, name: moment.location.name };
        const others = places.filter((place) => !samePlace(place, main));
        return [main, ...others];
    }
    return places;
};

const normalizeLocation = (raw: any): MomentLocation | null => {
    if (!raw || typeof raw !== 'object') return null;
    const lat = Number(raw.lat);
    const lng = Number(raw.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
        lat,
        lng,
        name: typeof raw.name === 'string' ? raw.name : '',
        source: raw.source === 'photo' || raw.source === 'search' ? raw.source : 'manual'
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
        location: normalizeLocation(data.location),
        legModes: normalizeLegModes(data.legModes),
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
    info: NewPhotoInfo | null | undefined,
    onProgress?: (fraction: number) => void
): Promise<MomentPhoto> => {
    if (!isImageFile(file)) throw new MomentError('not-image');
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
        return {
            id: photoId,
            driveFileId,
            width: compressed.width,
            height: compressed.height,
            size: compressed.blob.size,
            // Firestore rejects undefined, so unknown is written as null.
            place: normalizePhotoPlace(info?.place),
            takenAt: info?.takenAt || null
        };
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
        uploaded.push(await uploadPhoto(driveFolderId as string, input.keptPhotos.length + i, input.newFiles[i], input.newFileInfo?.[i], (fraction) =>
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
        location: input.location === undefined
            ? existing?.location || null
            : input.location && { ...input.location, name: input.location.name.trim().slice(0, 120) },
        legModes: existing?.legModes || {},
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

// ---- Merging several moments into one (e.g. the days of one trip) ----

export interface MergeInput {
    title: string;
    note: string;
}

/** Oldest first: the order the merged photos and notes follow. */
const chronological = (moments: Moment[]) => [...moments].sort((a, b) =>
    a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

/** Title and note the merge form starts with: the first title, every distinct note. */
export const mergeDefaults = (moments: Moment[]): MergeInput => {
    const ordered = chronological(moments);
    const notes = ordered.map((moment) => moment.note.trim()).filter(Boolean);
    return {
        title: ordered.find((moment) => moment.title.trim())?.title.trim() || '',
        note: Array.from(new Set(notes)).join('\n\n')
    };
};

export const mergedPhotoCount = (moments: Moment[]) => moments.reduce((sum, moment) => sum + moment.photos.length, 0);

/**
 * The moment that results from merging: kept under the oldest moment's id, dated on the
 * first day, with every photo (oldest moment first, each keeping its own place and time).
 */
export const buildMergedMoment = (moments: Moment[], input: MergeInput, now = new Date().toISOString()): Moment => {
    const ordered = chronological(moments);
    const target = ordered[0];
    const legModes: Record<string, TravelMode> = {};
    ordered.forEach((moment) => Object.assign(legModes, moment.legModes || {}));
    return {
        id: target.id,
        title: input.title.trim(),
        date: target.date,
        note: input.note.trim(),
        photos: ordered.flatMap((moment) => moment.photos),
        driveFolderId: ordered.find((moment) => moment.driveFolderId)?.driveFolderId || null,
        location: ordered.find((moment) => moment.location)?.location || null,
        legModes,
        createdAt: target.createdAt || now,
        updatedAt: now
    };
};

/**
 * Merges moments into one. The photos stay in Drive: they are moved into the kept moment's
 * folder, and an old folder goes to the Drive trash only once all its photos were moved
 * (a photo that could not be moved still works from its old folder). The merged document
 * is written and the other documents deleted in one batch, so nothing is half-merged.
 */
export const mergeMoments = async (
    uid: string,
    moments: Moment[],
    input: MergeInput,
    onProgress?: (done: number, total: number) => void
): Promise<Moment> => {
    if (moments.length < 2) throw new MomentError('failed', 'need at least two moments');
    if (mergedPhotoCount(moments) > MAX_PHOTOS_PER_MOMENT) throw new MomentError('failed', 'too many photos');
    const merged = buildMergedMoment(moments, input);
    const folderId = merged.driveFolderId;

    const emptiedFolders: string[] = [];
    if (folderId) {
        const toMove = moments.filter((moment) => moment.driveFolderId && moment.driveFolderId !== folderId);
        const total = toMove.reduce((sum, moment) => sum + moment.photos.length, 0);
        let done = 0;
        for (const moment of toMove) {
            let allMoved = true;
            for (const photo of moment.photos) {
                onProgress?.(done, total);
                try {
                    await moveDriveFile(photo.driveFileId, folderId, moment.driveFolderId as string);
                } catch (error) {
                    allMoved = false;
                    console.warn('Could not move photo to the merged folder', error);
                }
                done += 1;
            }
            if (allMoved) emptiedFolders.push(moment.driveFolderId as string);
        }
        onProgress?.(total, total);
        const before = moments.find((moment) => moment.driveFolderId === folderId);
        const name = momentFolderName(merged.date, merged.title);
        if (before && momentFolderName(before.date, before.title) !== name) {
            await renameDriveFile(folderId, name).catch((error) => console.warn('Could not rename Drive folder', error));
        }
    }

    const batch = writeBatch(db);
    const { id, ...data } = merged;
    batch.set(doc(momentsCollection(uid), id), data);
    moments.filter((moment) => moment.id !== id).forEach((moment) => batch.delete(doc(momentsCollection(uid), moment.id)));
    try {
        await batch.commit();
    } catch (error) {
        throw toMomentError(error);
    }

    await trashQuietly(emptiedFolders);
    return merged;
};
