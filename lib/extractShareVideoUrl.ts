import type { ShareIntent } from 'expo-share-intent';

export const SHARE_VIDEO_URL_PATTERN = /tiktok\.com|instagram\.com|facebook\.com|fb\.watch/i;

/** Pull a supported social video URL out of a native share intent payload. */
export function extractShareVideoUrl(shareIntent: ShareIntent): string | null {
    const candidates: string[] = [];

    if (shareIntent.webUrl) candidates.push(shareIntent.webUrl);
    if (shareIntent.text) candidates.push(shareIntent.text);

    for (const raw of candidates) {
        const url = firstSupportedVideoUrl(raw);
        if (url) return url;
    }

    return null;
}

function firstSupportedVideoUrl(raw: string): string | null {
    const matches = raw.match(/https?:\/\/[^\s<>"']+/gi);
    if (!matches) return null;

    for (const match of matches) {
        const cleaned = match.replace(/[.,;:!?)]+$/, '');
        if (SHARE_VIDEO_URL_PATTERN.test(cleaned)) return cleaned;
    }

    return null;
}
