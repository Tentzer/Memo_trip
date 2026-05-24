import { getShareExtensionKey } from 'expo-share-intent';

const SHARE_SCHEME = 'memo-trip';

export function redirectSystemPath({
    path,
}: {
    path: string;
    initial: string;
}) {
    try {
        const shareKey = getShareExtensionKey({ scheme: SHARE_SCHEME }).toLowerCase();
        const normalizedPath = path.toLowerCase();
        if (normalizedPath.includes('dataurl=') && normalizedPath.includes(shareKey)) {
            return '/shareintent';
        }
        return path;
    } catch {
        return '/';
    }
}
