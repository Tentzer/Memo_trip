import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';
import { Image } from 'react-native';

import { braveProxiedThumbUrl, pinThumbnailForRemoteCover } from '@/lib/remotePinThumbnail';

const DEFAULT_MAX_EDGE = 2048;
const DEFAULT_JPEG_QUALITY = 0.82;
const DEFAULT_PIN_THUMB_EDGE = 200;
const DEFAULT_PIN_THUMB_QUALITY = 0.7;

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

function pinThumbEdgeFromEnv(): number {
    const raw = process.env.EXPO_PUBLIC_PIN_THUMB_MAX_EDGE;
    if (raw == null || raw === '') return DEFAULT_PIN_THUMB_EDGE;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 32 && n <= 512 ? n : DEFAULT_PIN_THUMB_EDGE;
}

function pinThumbQualityFromEnv(): number {
    const raw = process.env.EXPO_PUBLIC_PIN_THUMB_JPEG_QUALITY;
    if (raw == null || raw === '') return DEFAULT_PIN_THUMB_QUALITY;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_PIN_THUMB_QUALITY;
}

export function isRemoteHttpUri(uri: string): boolean {
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

/**
 * JPEG whose longest edge is about 200px, for map pins.
 * Local camera and gallery files only. Remote covers are downloaded first.
 */
export async function createPinThumbnail(uri: string): Promise<string> {
    const maxEdge = pinThumbEdgeFromEnv();
    const { width, height } = await getImageSize(uri);
    if (!(width > 0) || !(height > 0)) {
        throw new Error('Image has no dimensions.');
    }

    const actions: Action[] =
        Math.max(width, height) <= maxEdge
            ? []
            : width >= height
              ? [{ resize: { width: maxEdge } }]
              : [{ resize: { height: maxEdge } }];

    const result = await manipulateAsync(uri, actions, {
        compress: pinThumbQualityFromEnv(),
        format: SaveFormat.JPEG,
    });
    return result.uri;
}

export function remoteThumbnailFallback(uri: string): string {
    return braveProxiedThumbUrl(uri, pinThumbEdgeFromEnv());
}

/**
 * Local JPEG to upload, or a remote thumbnail URL when a remote cover cannot be rendered.
 * Camera files stay on the local manipulator path.
 */
export async function preparePinThumbnail(
    uri: string,
): Promise<{ uploadUri: string } | { fallbackUrl: string }> {
    if (!isRemoteHttpUri(uri)) {
        return { uploadUri: await createPinThumbnail(uri) };
    }
    return pinThumbnailForRemoteCover(uri, {
        edge: pinThumbEdgeFromEnv(),
        compress: pinThumbQualityFromEnv(),
        cacheDirectory: cacheDirectory ?? '',
        downloadAsync: (from, to) => downloadAsync(from, to),
        getImageSize,
        manipulateAsync: async (localUri, actions, options) => {
            const rendered = await manipulateAsync(localUri, actions, {
                compress: options.compress,
                format: SaveFormat.JPEG,
            });
            return { uri: rendered.uri };
        },
    });
}
