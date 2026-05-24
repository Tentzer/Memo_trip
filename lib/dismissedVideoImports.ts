import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeImportUrl } from '@/lib/extractShareVideoUrl';

type DismissedImportStore = { ids: string[]; urls: string[] };

export type DismissedImportSets = { ids: Set<string>; urls: Set<string> };

function storageKey(userId: string): string {
    return `@memo_trip/dismissed_video_imports:${userId}`;
}

function urlKeys(dismissed: DismissedImportSets): Set<string> {
    const keys = new Set<string>();
    for (const stored of dismissed.urls) {
        const key = normalizeImportUrl(stored);
        if (key) keys.add(key);
    }
    return keys;
}

export function isRealImportJobId(jobId: string): boolean {
    return !jobId.startsWith('temp-');
}

export function isImportJobDismissed(
    dismissed: DismissedImportSets,
    jobId: string,
    url: string,
): boolean {
    if (dismissed.ids.has(jobId)) return true;
    const key = normalizeImportUrl(url);
    if (!key) return false;
    return urlKeys(dismissed).has(key);
}

export async function loadDismissedImports(userId: string): Promise<DismissedImportSets> {
    try {
        const raw = await AsyncStorage.getItem(storageKey(userId));
        if (!raw) return { ids: new Set(), urls: new Set() };
        const parsed = JSON.parse(raw) as DismissedImportStore;
        const urls = new Set<string>();
        for (const stored of Array.isArray(parsed.urls) ? parsed.urls : []) {
            const normalized = normalizeImportUrl(stored);
            if (normalized) urls.add(normalized);
            else if (stored.trim()) urls.add(stored.trim());
        }
        return {
            ids: new Set(Array.isArray(parsed.ids) ? parsed.ids : []),
            urls,
        };
    } catch {
        return { ids: new Set(), urls: new Set() };
    }
}

export async function saveDismissedImports(userId: string, dismissed: DismissedImportSets): Promise<void> {
    const payload: DismissedImportStore = {
        ids: [...dismissed.ids],
        urls: [...dismissed.urls],
    };
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(payload));
}

export function rememberDismissedImport(
    dismissed: DismissedImportSets,
    jobId: string,
    url: string,
): void {
    dismissed.ids.add(jobId);
    const key = normalizeImportUrl(url);
    if (key) dismissed.urls.add(key);
}

export function forgetDismissedImport(
    dismissed: DismissedImportSets,
    jobId: string,
    url: string,
): void {
    dismissed.ids.delete(jobId);
    forgetDismissedImportUrl(dismissed, url);
}

/** Allow the same reel URL to be imported again after the user cleared a prior import. */
export function forgetDismissedImportUrl(dismissed: DismissedImportSets, url: string): void {
    const key = normalizeImportUrl(url);
    if (!key) return;
    for (const stored of [...dismissed.urls]) {
        if (normalizeImportUrl(stored) === key || stored === key) {
            dismissed.urls.delete(stored);
        }
    }
}
