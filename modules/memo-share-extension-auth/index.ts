import { requireOptionalNativeModule } from 'expo-modules-core';

type MemoShareExtensionAuthNative = {
    setAccessToken: (token: string) => void;
    hasAccessToken: () => boolean;
    consumeDirectImportHandoff: () => { url: string } | null;
};

const native = requireOptionalNativeModule<MemoShareExtensionAuthNative>('MemoShareExtensionAuth');

export function setShareExtensionAccessToken(token: string | null): void {
    if (!native?.setAccessToken) return;
    native.setAccessToken(token ?? '');
}

/** True when JWT was written to the iOS App Group (dev client only). */
export function hasShareExtensionAccessToken(): boolean {
    if (!native?.hasAccessToken) return false;
    return native.hasAccessToken();
}

/** Returns URL if the iOS share extension already queued this reel (clears handoff). */
export function consumeDirectImportHandoff(): string | null {
    if (!native?.consumeDirectImportHandoff) return null;
    const payload = native.consumeDirectImportHandoff();
    const url = payload?.url?.trim();
    return url || null;
}
