import type { ShareIntent } from 'expo-share-intent';

const VIDEO_HOSTS = [
    'tiktok.com',
    'instagram.com',
    'instagr.am',
    'l.instagram.com',
    'facebook.com',
    'fb.watch',
];

function trimTrailingPunctuation(url: string): string {
    let value = url;
    while (value.length > 0) {
        const last = value[value.length - 1];
        if (/[a-zA-Z0-9/]/.test(last)) break;
        value = value.slice(0, -1);
    }
    return value;
}

function extractHttpsVideoUrl(text: string): string | null {
    const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    for (const raw of matches) {
        const url = trimTrailingPunctuation(raw.trim());
        const lower = url.toLowerCase();
        if (VIDEO_HOSTS.some((host) => lower.includes(host))) {
            return url;
        }
    }
    return null;
}

function extractSchemelessVideoUrl(text: string): string | null {
    const match = text.match(
        /\b(?:(?:www\.|vm\.)?tiktok\.com|(?:www\.)?(?:instagram\.com|instagr\.am)|(?:m\.)?facebook\.com|fb\.watch)\/[^\s<>"']+/i,
    );
    if (!match) return null;
    const path = trimTrailingPunctuation(match[0].trim());
    return path.startsWith('http') ? path : `https://${path}`;
}

function extractFromText(text: string | null | undefined): string | null {
    if (!text) return null;
    return extractHttpsVideoUrl(text) ?? extractSchemelessVideoUrl(text);
}

export function extractShareVideoUrl(shareIntent: ShareIntent): string | null {
    const candidates = [
        shareIntent.webUrl,
        shareIntent.text,
        shareIntent.meta?.title,
        ...(shareIntent.files ?? []).map((file) => file.path).filter(Boolean),
    ];

    for (const candidate of candidates) {
        const url = extractFromText(candidate);
        if (url) return url;
    }

    return null;
}
