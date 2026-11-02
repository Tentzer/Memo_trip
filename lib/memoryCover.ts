import { braveProxiedThumbUrl } from '@/lib/remotePinThumbnail';
import { isPlaceholderPhoto } from '@/lib/places/saveSearchedPlace';

const DEFAULT_PIN_EDGE = 200;

function isRemoteHttpUri(uri: string): boolean {
    const lower = uri.trim().toLowerCase();
    return lower.startsWith('http://') || lower.startsWith('https://');
}

/**
 * Remote place covers are stored as the Brave (or other) URLs themselves.
 * Local camera files still go through upload and get a thumbnail later.
 */
export function memoryCoverFields(photoUri: string): { uri: string; thumbUri: string | null } {
    const uri = photoUri.trim();
    if (isRemoteHttpUri(uri) && !isPlaceholderPhoto(uri)) {
        return { uri, thumbUri: braveProxiedThumbUrl(uri, DEFAULT_PIN_EDGE) };
    }
    return { uri, thumbUri: null };
}
