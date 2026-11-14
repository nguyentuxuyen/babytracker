// Moment photos live in the user's own Google Drive, in a folder the app creates
// ("Baby Tracker - Kỷ niệm", one subfolder per moment). The server (api/drive.js) keeps
// the Google refresh token; the browser asks it for short-lived access tokens and then
// talks to the Drive API directly.
import { auth } from './config';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const PHOTO_CACHE = 'moment-photos-v1';
const TOKEN_MARGIN_MS = 2 * 60 * 1000;

export type DriveErrorCode = 'not-connected' | 'not-configured' | 'api-disabled' | 'failed';

export class DriveError extends Error {
    code: DriveErrorCode;
    constructor(code: DriveErrorCode, message?: string) {
        super(message || code);
        this.code = code;
    }
}

export interface DriveStatus {
    configured: boolean;
    connected: boolean;
    folderId: string | null;
}

interface DriveAccess {
    accessToken: string;
    folderId: string;
    expiresAt: number;
}

const callDriveApi = async (body: Record<string, unknown>) => {
    const user = auth.currentUser;
    if (!user) throw new DriveError('failed', 'not signed in');
    const response = await fetch('/api/drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 409) throw new DriveError('not-connected');
    if (response.status === 503) throw new DriveError('not-configured');
    if (data?.error === 'drive-api-disabled') throw new DriveError('api-disabled', 'server: Drive API disabled');
    if (!response.ok) throw new DriveError('failed', `server ${response.status} ${data?.error || ''}`.trim());
    return data;
};

// ---- Status (shared by Settings and the moment editor) ----

let statusPromise: Promise<DriveStatus> | null = null;
const statusListeners = new Set<(status: DriveStatus) => void>();

export const getDriveStatus = (refresh = false): Promise<DriveStatus> => {
    if (!statusPromise || refresh) {
        statusPromise = callDriveApi({ action: 'status' }).then((data) => {
            const status: DriveStatus = {
                configured: Boolean(data.configured),
                connected: Boolean(data.connected),
                folderId: typeof data.folderId === 'string' ? data.folderId : null
            };
            statusListeners.forEach((listener) => listener(status));
            return status;
        });
        statusPromise.catch(() => { statusPromise = null; });
    }
    return statusPromise;
};

export const onDriveStatus = (listener: (status: DriveStatus) => void) => {
    statusListeners.add(listener);
    return () => { statusListeners.delete(listener); };
};

const markDisconnected = () => {
    access = null;
    statusPromise = Promise.resolve({ configured: true, connected: false, folderId: null });
    statusListeners.forEach((listener) => listener({ configured: true, connected: false, folderId: null }));
};

/** Sends the browser to Google's consent page; it comes back to `returnTo?drive=connected`. */
export const connectDrive = async (returnTo = window.location.pathname) => {
    const { url } = await callDriveApi({ action: 'auth_url', returnTo });
    window.location.assign(url);
};

export const disconnectDrive = async () => {
    await callDriveApi({ action: 'disconnect' });
    markDisconnected();
};

export const driveFolderUrl = (folderId: string) => `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;

// ---- Access token ----

let access: DriveAccess | null = null;
let accessPromise: Promise<DriveAccess> | null = null;

const getAccess = async (): Promise<DriveAccess> => {
    if (access && access.expiresAt - TOKEN_MARGIN_MS > Date.now()) return access;
    if (!accessPromise) {
        accessPromise = callDriveApi({ action: 'token' })
            .then((data) => {
                access = { accessToken: data.accessToken, folderId: data.folderId, expiresAt: Date.now() + data.expiresIn * 1000 };
                return access;
            })
            .catch((error) => {
                if (error instanceof DriveError && error.code === 'not-connected') markDisconnected();
                throw error;
            })
            .finally(() => { accessPromise = null; });
    }
    return accessPromise;
};

// One retry with a fresh token when Google says the cached one is no longer valid.
const driveFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const { accessToken } = await getAccess();
        const response = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${accessToken}` } });
        if (response.status !== 401 || attempt === 1) return response;
        access = null;
    }
    throw new DriveError('failed');
};

// ---- Folders and files ----

// Turns a failed Drive API answer into an error that says why: the Drive API not enabled
// in Google Cloud, access withdrawn, or the status and Google's reason for anything else.
export const driveFailure = (what: string, status: number, bodyText: string): DriveError => {
    let reason = '';
    let message = '';
    try {
        const error = JSON.parse(bodyText)?.error || {};
        reason = error.errors?.[0]?.reason || error.status || '';
        message = error.message || '';
    } catch {
        // Not JSON; keep the status only.
    }
    const text = `${reason} ${message}`;
    if (status === 403 && /accessNotConfigured|SERVICE_DISABLED|has not been used|is disabled/i.test(text)) {
        return new DriveError('api-disabled', `${what} ${status} ${reason}`.trim());
    }
    if (status === 403 && /insufficient|ACCESS_TOKEN_SCOPE/i.test(text)) {
        return new DriveError('not-connected', `${what} ${status} ${reason}`.trim());
    }
    return new DriveError('failed', `${what} ${status} ${reason || message.slice(0, 80)}`.trim());
};

const failureOf = async (what: string, response: Response) => driveFailure(what, response.status, await response.text().catch(() => ''));

const cleanName = (name: string) => name.replace(/[\\/]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

export const momentFolderName = (date: string, title: string) => cleanName(title ? `${date} ${title}` : date);

/** Creates a subfolder of the app folder and returns its id. */
export const createMomentFolder = async (name: string): Promise<string> => {
    const { folderId } = await getAccess();
    const response = await driveFetch(`${DRIVE_FILES}?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName(name), mimeType: FOLDER_MIME, parents: [folderId] })
    });
    if (!response.ok) throw await failureOf('folder', response);
    return (await response.json()).id;
};

export const renameDriveFile = async (fileId: string, name: string) => {
    const response = await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName(name) })
    });
    if (!response.ok) throw await failureOf('rename', response);
};

/** Moves a file from one folder to another (both inside the app folder). */
export const moveDriveFile = async (fileId: string, toFolderId: string, fromFolderId: string) => {
    const params = `addParents=${encodeURIComponent(toFolderId)}&removeParents=${encodeURIComponent(fromFolderId)}&fields=id`;
    const response = await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?${params}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
    });
    if (!response.ok) throw await failureOf('move', response);
};

/** Moves a file or folder to the Drive trash (the user can still restore it for 30 days). */
export const trashDriveFile = async (fileId: string) => {
    const response = await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?fields=id`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trashed: true })
    });
    if (!response.ok && response.status !== 404) throw await failureOf('trash', response);
    forgetCachedPhoto(fileId);
};

/** Multipart upload with progress; returns the new file id. */
export const uploadToDrive = async (
    blob: Blob,
    name: string,
    parentId: string,
    onProgress?: (fraction: number) => void
): Promise<string> => {
    const boundary = `bt${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({ name: cleanName(name), parents: [parentId] });
    const body = new Blob([
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
        `--${boundary}\r\nContent-Type: ${blob.type || 'image/jpeg'}\r\n\r\n`,
        blob,
        `\r\n--${boundary}--`
    ]);

    const send = (accessToken: string) => new Promise<{ status: number; text: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);
        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress?.(event.loaded / event.total);
        };
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
        xhr.onerror = () => reject(new DriveError('failed', 'upload network error'));
        xhr.send(body);
    });

    let result = await send((await getAccess()).accessToken);
    if (result.status === 401) {
        access = null;
        result = await send((await getAccess()).accessToken);
    }
    if (result.status < 200 || result.status >= 300) throw driveFailure('upload', result.status, result.text);
    const fileId = JSON.parse(result.text).id as string;
    // What was just uploaded is shown right away, so keep it without downloading it again.
    void cachePhoto(fileId, blob);
    return fileId;
};

// ---- Showing photos ----
// Drive files need the access token, so they cannot be <img src> directly: each photo is
// downloaded once, kept in Cache Storage (works offline next time) and shown as a blob URL.

const objectUrls = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

const cacheKey = (fileId: string) => `/__moment-photo/${encodeURIComponent(fileId)}`;

const openCache = async () => {
    try {
        return typeof caches !== 'undefined' ? await caches.open(PHOTO_CACHE) : null;
    } catch {
        return null;
    }
};

const cachePhoto = async (fileId: string, blob: Blob) => {
    if (!objectUrls.has(fileId)) objectUrls.set(fileId, URL.createObjectURL(blob));
    const cache = await openCache();
    await cache?.put(cacheKey(fileId), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })).catch(() => undefined);
};

const forgetCachedPhoto = (fileId: string) => {
    const url = objectUrls.get(fileId);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(fileId);
    void openCache().then((cache) => cache?.delete(cacheKey(fileId)));
};

export const cachedPhotoUrl = (fileId: string) => objectUrls.get(fileId) || null;

/** Blob URL for a Drive photo, from memory, Cache Storage or the network. */
export const loadDrivePhoto = (fileId: string): Promise<string> => {
    const known = objectUrls.get(fileId);
    if (known) return Promise.resolve(known);
    let promise = pending.get(fileId);
    if (!promise) {
        promise = (async () => {
            const cache = await openCache();
            const hit = await cache?.match(cacheKey(fileId));
            let blob: Blob;
            if (hit) {
                blob = await hit.blob();
            } else {
                const response = await driveFetch(`${DRIVE_FILES}/${encodeURIComponent(fileId)}?alt=media`);
                if (!response.ok) throw await failureOf('download', response);
                blob = await response.blob();
                await cache?.put(cacheKey(fileId), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/jpeg' } })).catch(() => undefined);
            }
            const url = URL.createObjectURL(blob);
            objectUrls.set(fileId, url);
            return url;
        })().finally(() => pending.delete(fileId));
        pending.set(fileId, promise);
    }
    return promise;
};
