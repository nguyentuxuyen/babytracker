// Reads where and when a photo was taken from its EXIF block (GPS when location was on,
// DateTimeOriginal). JPEG and HEIC/HEIF (iPhone) are understood. Only the parts of the
// file that hold EXIF are read; anything unexpected gives null.

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

// ---- HEIC / HEIF (ISO base media boxes) ----
// The EXIF block is an item of the top-level 'meta' box: 'iinf' names it ('Exif') and
// 'iloc' says where its bytes are in the file, often after the image data.

interface Box { type: string; start: number; end: number; body: number }

const boxesIn = (view: DataView, start: number, end: number): Box[] => {
    const list: Box[] = [];
    let offset = start;
    while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        const type = readAscii(view, offset + 4, 4);
        let header = 8;
        if (size === 1) {
            if (offset + 16 > end) break;
            size = Number(view.getBigUint64(offset + 8));
            header = 16;
        } else if (size === 0) {
            size = end - offset;
        }
        if (size < header) break;
        list.push({ type, start: offset, end: Math.min(offset + size, end), body: offset + header });
        offset += size;
    }
    return list;
};

export const isHeif = (buffer: ArrayBuffer) => {
    const view = new DataView(buffer);
    return view.byteLength >= 12 && readAscii(view, 4, 4) === 'ftyp';
};

/** Where the EXIF item of a HEIC/HEIF file is, as file offset and length. */
export const heifExifLocation = (buffer: ArrayBuffer): { offset: number; length: number } | null => {
    const view = new DataView(buffer);
    try {
        const meta = boxesIn(view, 0, view.byteLength).find((box) => box.type === 'meta');
        if (!meta) return null;
        const children = boxesIn(view, meta.body + 4, meta.end); // full box: skip version/flags
        const iinf = children.find((box) => box.type === 'iinf');
        const iloc = children.find((box) => box.type === 'iloc');
        if (!iinf || !iloc) return null;

        const infVersion = view.getUint8(iinf.body);
        const entriesStart = iinf.body + 4 + (infVersion === 0 ? 2 : 4);
        let exifId: number | null = null;
        for (const infe of boxesIn(view, entriesStart, iinf.end)) {
            if (infe.type !== 'infe') continue;
            const version = view.getUint8(infe.body);
            if (version < 2) continue;
            const id = version === 2 ? view.getUint16(infe.body + 4) : view.getUint32(infe.body + 4);
            const typeAt = infe.body + 4 + (version === 2 ? 2 : 4) + 2;
            if (readAscii(view, typeAt, 4) === 'Exif') { exifId = id; break; }
        }
        if (exifId === null) return null;

        const version = view.getUint8(iloc.body);
        let at = iloc.body + 4;
        const sizes = view.getUint8(at);
        const sizes2 = view.getUint8(at + 1);
        at += 2;
        const offsetSize = sizes >> 4;
        const lengthSize = sizes & 15;
        const baseSize = sizes2 >> 4;
        const indexSize = version === 1 || version === 2 ? sizes2 & 15 : 0;
        const readN = (size: number) => {
            const value = size === 0 ? 0 : size === 4 ? view.getUint32(at) : size === 8 ? Number(view.getBigUint64(at)) : NaN;
            if (Number.isNaN(value)) throw new Error('bad size');
            at += size;
            return value;
        };
        const count = version < 2 ? view.getUint16(at) : view.getUint32(at);
        at += version < 2 ? 2 : 4;
        for (let i = 0; i < count; i += 1) {
            const id = version < 2 ? view.getUint16(at) : view.getUint32(at);
            at += version < 2 ? 2 : 4;
            let method = 0;
            if (version === 1 || version === 2) { method = view.getUint16(at) & 15; at += 2; }
            at += 2; // data_reference_index
            const base = readN(baseSize);
            const extents = view.getUint16(at);
            at += 2;
            let first: { offset: number; length: number } | null = null;
            for (let e = 0; e < extents; e += 1) {
                at += indexSize;
                const offset = readN(offsetSize);
                const length = readN(lengthSize);
                if (!first) first = { offset: base + offset, length };
            }
            // Only items stored straight in the file (construction method 0) are supported.
            if (id === exifId) return method === 0 && first && first.length > 8 ? first : null;
        }
        return null;
    } catch {
        return null; // Truncated or unexpected boxes.
    }
};

/** Parses the bytes of a HEIF 'Exif' item: a 4-byte offset, then the TIFF block. */
export const metaFromHeifExif = (buffer: ArrayBuffer): PhotoMeta => {
    const view = new DataView(buffer);
    try {
        const tiffStart = 4 + view.getUint32(0);
        if (tiffStart + 8 > view.byteLength) return EMPTY_META;
        return metaFromTiff(view, tiffStart);
    } catch {
        return EMPTY_META;
    }
};

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
        const head = await readBuffer(file.slice(0, EXIF_READ_BYTES));
        if (!isHeif(head)) return metaFromJpeg(head);
        const where = heifExifLocation(head);
        if (!where || where.offset >= file.size) return EMPTY_META;
        const length = Math.min(where.length, EXIF_READ_BYTES);
        return metaFromHeifExif(await readBuffer(file.slice(where.offset, where.offset + length)));
    } catch {
        return EMPTY_META;
    }
};

export const readPhotoGps = async (file: Blob): Promise<GpsPoint | null> => (await readPhotoMeta(file)).gps;

// Some pickers (and HEIC files on Windows/Android) give no MIME type; trust the extension then.
const IMAGE_NAME = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i;
export const isImageFile = (file: File) => file.type.startsWith('image/') || (!file.type && IMAGE_NAME.test(file.name));
