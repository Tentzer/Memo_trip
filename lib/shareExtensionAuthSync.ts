import { requireOptionalNativeModule } from 'expo-modules-core';

type ExpoShareIntentNative = {
    setShareExtensionAuthToken?: (token: string) => void;
};

const native = requireOptionalNativeModule('ExpoShareIntentModule') as ExpoShareIntentNative | null;

/** Copies the Supabase access token into App Group UserDefaults so the iOS share extension can call Edge Functions without opening the app. */
export function syncShareExtensionAuthToken(accessToken: string | null): void {
    if (!native?.setShareExtensionAuthToken) return;
    try {
        native.setShareExtensionAuthToken(accessToken ?? '');
    } catch {
        /* no-op: extension-only capability */
    }
}

/** Refreshes the session then writes the latest access token for the share extension. */
export async function refreshShareExtensionAuthToken(): Promise<void> {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    syncShareExtensionAuthToken(session?.access_token ?? null);
}
