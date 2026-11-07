// Reads where and when a JPEG photo was taken from its EXIF block (GPS when location was
// on, DateTimeOriginal). Only the first part of the file is read; anything unexpected gives null.

export interface GpsPoint {
    lat: number;
    lng: number;
}

const EXIF_READ_BYTES = 256 * 1024;

const readAscii = (view: DataView, offset: number, length: number) => {
    let text = '';
    for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
        const code = view.getUint8(offset + i);
        if (code === 0) break;
        text += String.fromCharCode(code);
    }
    return text;
};

export interface PhotoMeta {
    gps: GpsPoint | null;
    /** Local capture time as written by the camera, "YYYY-MM-DDTHH:MM:SS". */
    takenAt: string | null;
}

const EMPTY_META: PhotoMeta = { gps: null, takenAt: null };

// "2026:11:05 14:03:22" -> "2026-11-05T14:03:22"
const parseExifDate = (text: string) => {
    const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
    if (!match || match[1] === '0000') return null;
    const [, y, mo, d, h, mi, se] = match;
    if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `${y}-${mo}-${d}T${h}:${mi}:${se}`;
};

/** Parses a TIFF block (the EXIF payload): GPS position and capture time. */
export const metaFromTiff = (view: DataView, tiffStart: number): PhotoMeta => {
    const order = view.getUint16(tiffStart);
    const little = order === 0x4949;
    if (!little && order !== 0x4d4d) return EMPTY_META;
    const u16 = (offset: number) => view.getUint16(offset, little);
    const u32 = (offset: number) => view.getUint32(offset, little);
    if (u16(tiffStart + 2) !== 42) return EMPTY_META;

    const entries = (ifdOffset: number) => {
        const start = tiffStart + ifdOffset;
        const count = u16(start);
        const list: Array<{ tag: number; type: number; count: number; valueOffset: number }> = [];
        for (let i = 0; i < count; i += 1) {
            const entry = start + 2 + i * 12;
            list.push({ tag: u16(entry), type: u16(entry + 2), count: u32(entry + 4), valueOffset: entry + 8 });
        }
        return list;
    };

    const ifd0 = entries(u32(tiffStart + 4));
    // ASCII values longer than 4 bytes live at an offset from the TIFF start.
    const asciiOf = (entry: { count: number; valueOffset: number }) => readAscii(
        view, entry.count > 4 ? tiffStart + u32(entry.valueOffset) : entry.valueOffset, entry.count);
    const exifPointer = ifd0.find((entry) => entry.tag === 0x8769);
    const original = exifPointer ? entries(u32(exifPointer.valueOffset)).find((entry) => entry.tag === 0x9003) : undefined;
    const modified = ifd0.find((entry) => entry.tag === 0x0132);
    const takenAt = (original && parseExifDate(asciiOf(original))) || (modified && parseExifDate(asciiOf(modified))) || null;

    const gpsPointer = ifd0.find((entry) => entry.tag === 0x8825);
    if (!gpsPointer) return { gps: null, takenAt };
    const gps = new Map(entries(u32(gpsPointer.valueOffset)).map((entry) => [entry.tag, entry]));

    const ref = (tag: number) => {
        const entry = gps.get(tag);
        return entry ? readAscii(view, entry.valueOffset, Math.min(entry.count, 4)) : '';
    };
    // Degrees, minutes, seconds as three unsigned rationals.
    const dms = (tag: number) => {
        const entry = gps.get(tag);
        if (!entry || entry.type !== 5 || entry.count < 3) return null;
        const base = tiffStart + u32(entry.valueOffset);
        const parts = [0, 1, 2].map((i) => {
            const denominator = u32(base + i * 8 + 4);
            return denominator ? u32(base + i * 8) / denominator : NaN;
        });
        if (parts.some((part) => !Number.isFinite(part))) return null;
        return parts[0] + parts[1] / 60 + parts[2] / 3600;
    };

    const lat = dms(2);
    const lng = dms(4);
    if (lat === null || lng === null) return { gps: null, takenAt };
    const point = { lat: ref(1) === 'S' ? -lat : lat, lng: ref(3) === 'W' ? -lng : lng };
    // 0,0 is what some apps write when they have no fix.
    if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || (point.lat === 0 && point.lng === 0)) return { gps: null, takenAt };
    return { gps: point, takenAt };
};

/** GPS position and capture time from a JPEG's APP1 Exif segment. */
export const metaFromJpeg = (buffer: ArrayBuffer): PhotoMeta => {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return EMPTY_META;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
        const marker = view.getUint16(offset);
        if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return EMPTY_META;
        const length = view.getUint16(offset + 2);
        if (marker === 0xffe1 && readAscii(view, offset + 4, 4) === 'Exif' && offset + 10 + 8 <= view.byteLength) {
            try {
                return metaFromTiff(view, offset + 10);
            } catch {
                return EMPTY_META; // Truncated or malformed block.
            }
        }
        offset += 2 + length;
    }
    return EMPTY_META;
};

export const gpsFromJpeg = (buffer: ArrayBuffer): GpsPoint | null => metaFromJpeg(buffer).gps;

// Blob.arrayBuffer is missing on older Safari; FileReader works everywhere.
const readBuffer = (blob: Blob) => (typeof blob.arrayBuffer === 'function'
    ? blob.arrayBuffer()
    : new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    }));

export const readPhotoMeta = async (file: Blob): Promise<PhotoMeta> => {
    try {
        return metaFromJpeg(await readBuffer(file.slice(0, EXIF_READ_BYTES)));
    } catch {
        return EMPTY_META;
    }
};

export const readPhotoGps = async (file: Blob): Promise<GpsPoint | null> => (await readPhotoMeta(file)).gps;
