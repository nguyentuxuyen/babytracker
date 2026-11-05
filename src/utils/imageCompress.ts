// Shrinks a picked photo before upload: longest side at most `maxSide`, re-encoded as JPEG.
// Re-encoding through a canvas also drops EXIF metadata such as GPS location.

export const MAX_PHOTO_SIDE = 1600;
export const PHOTO_QUALITY = 0.82;

export interface CompressedImage {
    blob: Blob;
    width: number;
    height: number;
}

export const fitWithin = (width: number, height: number, maxSide: number) => {
    const longest = Math.max(width, height);
    if (!longest || longest <= maxSide) return { width, height };
    const scale = maxSide / longest;
    return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

const loadBitmap = async (file: Blob): Promise<ImageBitmap | HTMLImageElement> => {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            // Fall back to <img> below (older Safari rejects the options object).
        }
    }
    const url = URL.createObjectURL(file);
    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        return image;
    } finally {
        URL.revokeObjectURL(url);
    }
};

export const compressImage = async (
    file: Blob,
    maxSide = MAX_PHOTO_SIDE,
    quality = PHOTO_QUALITY
): Promise<CompressedImage> => {
    const source = await loadBitmap(file);
    const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
    const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
    const { width, height } = fitWithin(sourceWidth, sourceHeight, maxSide);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is not available');
    context.drawImage(source, 0, 0, width, height);
    if ('close' in source) source.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not encode the photo');
    return { blob, width, height };
};
