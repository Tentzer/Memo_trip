export type SourcePlatform = 'instagram' | 'tiktok' | 'facebook';

/** Detects the social platform a memo was imported from by its source URL. */
export function getSourcePlatform(sourceUrl: string | undefined | null): SourcePlatform | null {
    if (!sourceUrl) return null;
    if (sourceUrl.includes('instagram.com')) return 'instagram';
    if (sourceUrl.includes('tiktok.com')) return 'tiktok';
    if (sourceUrl.includes('facebook.com') || sourceUrl.includes('fb.watch')) return 'facebook';
    return null;
}
