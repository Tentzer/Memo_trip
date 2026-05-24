import type { ShareIntent } from 'expo-share-intent';

export const SHARE_VIDEO_URL_PATTERN = /tiktok\.com|instagram\.com|facebook\.com|fb\.watch/i;

/** Canonical key for matching the same reel across share payloads and dismiss storage. */
export function normalizeImportUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    try {
        const u = new URL(trimmed);
        u.hash = '';
        u.search = '';
        const host = u.hostname.toLowerCase().replace(/^www\./, '');
        const path = u.pathname.replace(/\/+$/, '') || '';
        return `${u.protocol}//${host}${path}`;
    } catch {
        return trimmed.toLowerCase();
    }
}

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
