import { gpsFromJpeg, heifExifLocation, isHeif, isImageFile, metaFromJpeg, readPhotoGps, readPhotoMeta } from './photoExif';

// Builds a minimal JPEG: SOI + APP1 Exif (IFD0 -> GPS IFD with lat/lng) + SOS.
const jpegWithGps = (
    lat: [number, number, number], latRef: string,
    lng: [number, number, number], lngRef: string,
    little = true
) => {
    const tiff = new DataView(new ArrayBuffer(200));
    const u16 = (o: number, v: number) => tiff.setUint16(o, v, little);
    const u32 = (o: number, v: number) => tiff.setUint32(o, v, little);
    tiff.setUint16(0, little ? 0x4949 : 0x4d4d);
    u16(2, 42);
    u32(4, 8); // IFD0 at 8
    u16(8, 1); // one entry: GPS pointer
    u16(10, 0x8825); u16(12, 4); u32(14, 1); u32(18, 26);
    u32(22, 0); // next IFD
    // GPS IFD at 26 with 4 entries
    u16(26, 4);
    const entry = (i: number, tag: number, type: number, count: number) => {
        const o = 28 + i * 12;
        u16(o, tag); u16(o + 2, type); u32(o + 4, count);
        return o + 8;
    };
    tiff.setUint8(entry(0, 1, 2, 2), latRef.charCodeAt(0));
    u32(entry(1, 2, 5, 3), 80);
    tiff.setUint8(entry(2, 3, 2, 2), lngRef.charCodeAt(0));
    u32(entry(3, 4, 5, 3), 104);
    [[80, lat], [104, lng]].forEach(([base, values]) => {
        (values as number[]).forEach((value, i) => {
            u32((base as number) + i * 8, Math.round(value * 100));
            u32((base as number) + i * 8 + 4, 100);
        });
    });

    const app1Length = 2 + 6 + tiff.byteLength;
    const bytes = new Uint8Array(4 + app1Length + 4);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0xffd8);
    view.setUint16(2, 0xffe1);
    view.setUint16(4, app1Length);
    bytes.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
    bytes.set(new Uint8Array(tiff.buffer), 12);
    view.setUint16(12 + tiff.byteLength, 0xffda);
    return bytes.buffer;
};

describe('exif gps', () => {
    it('reads north/east coordinates (Ueno Park)', () => {
        const point = gpsFromJpeg(jpegWithGps([35, 42, 54.36], 'N', [139, 46, 17.4], 'E'));
        expect(point!.lat).toBeCloseTo(35.7151, 4);
        expect(point!.lng).toBeCloseTo(139.7715, 4);
    });

    it('applies S/W and big-endian files', () => {
        const point = gpsFromJpeg(jpegWithGps([33, 51, 0], 'S', [70, 40, 0], 'W', false));
        expect(point!.lat).toBeCloseTo(-33.85, 4);
        expect(point!.lng).toBeCloseTo(-70.6667, 4);
    });

    it('returns null for photos without GPS, 0,0 and non-JPEG data', () => {
        expect(gpsFromJpeg(jpegWithGps([0, 0, 0], 'N', [0, 0, 0], 'E'))).toBeNull();
        expect(gpsFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull();
        expect(gpsFromJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    });

    it('reads a File', async () => {
        const file = new File([jpegWithGps([35, 0, 0], 'N', [139, 0, 0], 'E')], 'a.jpg', { type: 'image/jpeg' });
        expect(await readPhotoGps(file)).toEqual({ lat: 35, lng: 139 });
        expect(await readPhotoGps(new File([new Uint8Array(10)], 'b.jpg'))).toBeNull();
    });
});

// JPEG whose IFD0 points to an Exif IFD holding DateTimeOriginal (or IFD0 DateTime).
const jpegWithDate = (text: string, tag: 'original' | 'modified' = 'original') => {
    const tiff = new DataView(new ArrayBuffer(120));
    tiff.setUint16(0, 0x4949);
    tiff.setUint16(2, 42, true);
    tiff.setUint32(4, 8, true);
    tiff.setUint16(8, 1, true);
    if (tag === 'original') {
        tiff.setUint16(10, 0x8769, true); tiff.setUint16(12, 4, true); tiff.setUint32(14, 1, true); tiff.setUint32(18, 26, true);
        tiff.setUint16(26, 1, true);
        tiff.setUint16(28, 0x9003, true); tiff.setUint16(30, 2, true); tiff.setUint32(32, 20, true); tiff.setUint32(36, 60, true);
    } else {
        tiff.setUint16(10, 0x0132, true); tiff.setUint16(12, 2, true); tiff.setUint32(14, 20, true); tiff.setUint32(18, 60, true);
    }
    [...text].forEach((c, i) => tiff.setUint8(60 + i, c.charCodeAt(0)));
    const bytes = new Uint8Array(4 + 8 + tiff.byteLength + 2);
    const view = new DataView(bytes.buffer);
    view.setUint16(0, 0xffd8); view.setUint16(2, 0xffe1); view.setUint16(4, 8 + tiff.byteLength);
    bytes.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
    bytes.set(new Uint8Array(tiff.buffer), 12);
    view.setUint16(12 + tiff.byteLength, 0xffda);
    return bytes.buffer;
};

describe('exif capture time', () => {
    it('reads DateTimeOriginal, else DateTime', () => {
        expect(metaFromJpeg(jpegWithDate('2026:11:05 14:03:22'))).toEqual({ gps: null, takenAt: '2026-11-05T14:03:22' });
        expect(metaFromJpeg(jpegWithDate('2026:10:01 08:00:00', 'modified')).takenAt).toBe('2026-10-01T08:00:00');
    });

    it('ignores empty or broken dates', () => {
        expect(metaFromJpeg(jpegWithDate('0000:00:00 00:00:00')).takenAt).toBeNull();
        expect(metaFromJpeg(jpegWithDate('garbage')).takenAt).toBeNull();
    });

    it('returns both GPS and time through readPhotoMeta', async () => {
        const meta = await readPhotoMeta(new File([jpegWithGps([35, 0, 0], 'N', [139, 0, 0], 'E')], 'a.jpg'));
        expect(meta).toEqual({ gps: { lat: 35, lng: 139 }, takenAt: null });
    });
});

// Minimal HEIC: ftyp, meta (iinf with an 'Exif' item, iloc pointing at it), then mdat with
// `filler` bytes of image data before the Exif item, like iPhone files.
const heicWithExif = (tiff: Uint8Array, filler: number, ilocVersion = 1) => {
    const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
    const u16 = (v: number) => [v >> 8, v & 255];
    const u32 = (v: number) => [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255];
    const box = (type: string, body: number[]) => [...u32(8 + body.length), ...ascii(type), ...body];
    const ftyp = box('ftyp', [...ascii('heic'), 0, 0, 0, 0, ...ascii('mif1heic')]);
    const infe = box('infe', [2, 0, 0, 0, ...u16(1), ...u16(0), ...ascii('hvc1'), 0]);
    const infeExif = box('infe', [2, 0, 0, 0, ...u16(7), ...u16(0), ...ascii('Exif'), 0]);
    const iinf = box('iinf', [0, 0, 0, 0, ...u16(2), ...infe, ...infeExif]);
    const ilocFor = (exifOffset: number, exifLength: number) => {
        const item = (id: number, offset: number, length: number) => [
            ...u16(id), ...(ilocVersion === 1 ? u16(0) : []), ...u16(0), ...u16(1), ...u32(offset), ...u32(length)
        ];
        return box('iloc', [ilocVersion, 0, 0, 0, 0x44, 0x00, ...u16(2), ...item(1, 0, 10), ...item(7, exifOffset, exifLength)]);
    };
    const exifItem = [...u32(6), ...ascii('Exif'), 0, 0, ...tiff];
    const metaLength = 8 + 4 + iinf.length + ilocFor(0, 0).length;
    const mdatStart = ftyp.length + metaLength;
    const exifOffset = mdatStart + 8 + filler;
    const meta = box('meta', [0, 0, 0, 0, ...iinf, ...ilocFor(exifOffset, exifItem.length)]);
    const mdatHeader = [...u32(8 + filler + exifItem.length), ...ascii('mdat')];
    const bytes = new Uint8Array(mdatStart + 8 + filler + exifItem.length);
    bytes.set([...ftyp, ...meta, ...mdatHeader], 0);
    bytes.set(exifItem, exifOffset);
    return bytes.buffer;
};

const tiffOf = (jpeg: ArrayBuffer) => new Uint8Array(jpeg.slice(12, jpeg.byteLength - 2));

describe('heic exif', () => {
    it('finds the Exif item and reads date and GPS, even far into the file', async () => {
        const dated = new File([heicWithExif(tiffOf(jpegWithDate('2026:11:01 10:20:30')), 400 * 1024)], 'IMG_1234.HEIC');
        expect(await readPhotoMeta(dated)).toEqual({ gps: null, takenAt: '2026-11-01T10:20:30' });
        const located = new File([heicWithExif(tiffOf(jpegWithGps([35, 0, 0], 'N', [139, 0, 0], 'E')), 100, 0)], 'b.heic');
        expect((await readPhotoMeta(located)).gps).toEqual({ lat: 35, lng: 139 });
    });

    it('locates the item, and gives up on files without one', () => {
        const buffer = heicWithExif(tiffOf(jpegWithDate('2026:11:01 10:20:30')), 50);
        const where = heifExifLocation(buffer)!;
        expect(where.length).toBe(10 + 120);
        expect(isHeif(buffer)).toBe(true);
        expect(heifExifLocation(buffer.slice(0, 40))).toBeNull();
        expect(heifExifLocation(jpegWithDate('2026:11:01 10:20:30'))).toBeNull();
    });
});

describe('isImageFile', () => {
    it('accepts image types, and known extensions when the type is missing', () => {
        expect(isImageFile(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(true);
        expect(isImageFile(new File(['x'], 'IMG_0001.HEIC'))).toBe(true);
        expect(isImageFile(new File(['x'], 'clip.mov'))).toBe(false);
        expect(isImageFile(new File(['x'], 'a.jpg', { type: 'video/mp4' }))).toBe(false);
    });
});
