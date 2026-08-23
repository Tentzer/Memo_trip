import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { Image } from 'react-native';

const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_JPEG_QUALITY = 0.82;

function maxEdgeFromEnv(): number {
    const raw = process.env.EXPO_PUBLIC_IMAGE_UPLOAD_MAX_EDGE;
    if (raw == null || raw === '') return DEFAULT_MAX_EDGE;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_EDGE;
}

function jpegQualityFromEnv(): number {
    const raw = process.env.EXPO_PUBLIC_IMAGE_UPLOAD_JPEG_QUALITY;
    if (raw == null || raw === '') return DEFAULT_JPEG_QUALITY;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_JPEG_QUALITY;
}

function isRemoteHttpUri(uri: string): boolean {
    const lower = uri.toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        Image.getSize(
            uri,
            (width, height) => resolve({ width, height }),
            (err) => reject(err)
        );
    });
}

/**
 * JPEG-compress local camera/gallery URIs and cap the longest edge before upload.
 * Remote http(s) URIs are returned unchanged (e.g. Google Places thumbnails).
 */
export async function compressLocalImageForUpload(uri: string): Promise<string> {
    if (isRemoteHttpUri(uri)) {
        return uri;
    }

    const maxEdge = maxEdgeFromEnv();
    const compress = jpegQualityFromEnv();

    try {
        const { width, height } = await getImageSize(uri);
        const longest = Math.max(width, height);

        const actions: Action[] =
            longest <= maxEdge
                ? []
                : width >= height
                  ? [{ resize: { width: maxEdge } }]
                  : [{ resize: { height: maxEdge } }];

        const result = await manipulateAsync(uri, actions, {
            compress,
            format: SaveFormat.JPEG,
        });
        return result.uri;
    } catch (e) {
        console.warn('compressLocalImageForUpload failed, using original URI:', e);
        return uri;
    }
}
