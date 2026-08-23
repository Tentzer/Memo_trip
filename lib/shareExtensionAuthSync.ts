import {
    consumeDirectImportHandoff as consumeHandoffNative,
    hasShareExtensionAccessToken,
    setShareExtensionAccessToken,
} from 'memo-share-extension-auth';

export { setShareExtensionAccessToken, hasShareExtensionAccessToken };

export function consumeDirectImportHandoff(): string | null {
    return consumeHandoffNative();
}

/** @deprecated Use setShareExtensionAccessToken */
export function syncShareExtensionAuthToken(accessToken: string | null): void {
    setShareExtensionAccessToken(accessToken);
}

export async function refreshShareExtensionAuthToken(): Promise<void> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    setShareExtensionAccessToken(session?.access_token ?? null);
}
