import * as Updates from 'expo-updates';
import { useEffect } from 'react';

/** Check for an OTA update on launch (production builds with expo-updates only). */
export function useEASUpdate() {
    useEffect(() => {
        if (__DEV__) return;
        if (!Updates.isEnabled) return;

        void (async () => {
            try {
                const check = await Updates.checkForUpdateAsync();
                if (!check.isAvailable) return;

                const fetched = await Updates.fetchUpdateAsync();
                if (fetched.isNew) {
                    await Updates.reloadAsync();
                }
            } catch {
                // OTA failures must not block app launch.
            }
        })();
    }, []);
}
