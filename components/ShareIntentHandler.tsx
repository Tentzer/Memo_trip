import { useImportQueue } from '@/context/ImportQueueContext';
import { extractShareVideoUrl } from '@/lib/extractShareVideoUrl';
import { useShareIntentContext } from 'expo-share-intent';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

type ShareIntentHandlerProps = {
    /** Wait until splash / initial navigation has finished. */
    appReady: boolean;
};

export default function ShareIntentHandler({ appReady }: ShareIntentHandlerProps) {
    const { isReady, hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
    const { enqueueUrl } = useImportQueue();
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();
    const handledKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!appReady || !isReady || !hasShareIntent) return;
        if (!rootNavigationState?.key) return;

        const url = extractShareVideoUrl(shareIntent);
        const key = url ?? shareIntent.text ?? shareIntent.webUrl ?? 'unknown';
        if (handledKeyRef.current === key) return;
        handledKeyRef.current = key;

        if (url) {
            enqueueUrl(url);
            router.navigate('/onboarding/Home');
        } else {
            router.navigate('/onboarding/video-import');
        }

        resetShareIntent();
    }, [
        appReady,
        isReady,
        hasShareIntent,
        shareIntent,
        resetShareIntent,
        enqueueUrl,
        router,
        rootNavigationState?.key,
    ]);

    useEffect(() => {
        if (!hasShareIntent) handledKeyRef.current = null;
    }, [hasShareIntent]);

    return null;
}
