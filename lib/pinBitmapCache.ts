import { PIN_BITMAP_PLACEHOLDER_KEY, pinBitmapFileName } from '@/lib/pinBitmapKey';

const memoryCache = new Map<string, string>();

/**
 * Immediate stand-in until a pin PNG is captured.
 * Generated once; every marker shares this URI.
 */
const PLACEHOLDER_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgAQMAAABJtOi3AAAABlBMVEUAAAAdTthXa7GBAAAAAXRSTlMAQObYZgAAACt0RVh0Q3JlYXRpb24gVGltZQBNb24sIDAyIE5vdiAyMDI2IDEyOjI5OjI4IEdNVH+kUF8AAAAtdEVYdFNvZnR3YXJlAGdpdGh1Yi5jb20vbWF0bWVuL0ltYWdlU2NyaXB0IHYzLjYuMGTNDn0AAABCSURBVHgBdY6xCQAgEANPLBzL0XS0H8VBxChvIw+muCpcAiFlAHUCbR1IkKROluxBkQZfhLILXHWlrvehbMAX59oG5tA2r0jUSnIAAAAASUVORK5CYII=';

let placeholderUri: string | null = null;

export function placeholderBitmapUri(): string {
    if (!placeholderUri) placeholderUri = `data:image/png;base64,${PLACEHOLDER_PNG}`;
    return placeholderUri;
}

export function peekPinBitmap(key: string): string | undefined {
    return memoryCache.get(key);
}

export function rememberPinBitmap(key: string, uri: string): void {
    memoryCache.set(key, uri);
}

export function pinBitmapCachePath(cacheDirectory: string, key: string): string {
    const base = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
    return `${base}pin-bitmaps/${pinBitmapFileName(key)}`;
}

export function bitmapUriForMarker(key: string): string {
    return peekPinBitmap(key)
        ?? peekPinBitmap(PIN_BITMAP_PLACEHOLDER_KEY)
        ?? placeholderBitmapUri();
}
