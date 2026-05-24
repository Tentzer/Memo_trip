import { useAuth } from '@/context/AuthContext';
import { useImportQueue } from '@/context/ImportQueueContext';
import { extractShareVideoUrl, normalizeImportUrl } from '@/lib/extractShareVideoUrl';
import { consumeDirectImportHandoff } from '@/lib/shareExtensionAuthSync';
import { useShareIntentContext } from 'expo-share-intent';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

type ShareIntentHandlerProps = {
    /** Wait until splash / initial navigation has finished. */
    appReady: boolean;
};

export default function ShareIntentHandler({ appReady }: ShareIntentHandlerProps) {
    const { user } = useAuth();
    const { isReady, hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
    const { enqueueUrl, refreshJobs, allowReimportForUrl } = useImportQueue();
    const router = useRouter();
    const rootNavigationState = useRootNavigationState();
    const handledKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!appReady || !isReady || !hasShareIntent || !user) return;
        if (!rootNavigationState?.key) return;

        const url = extractShareVideoUrl(shareIntent);
        const handoffUrl = consumeDirectImportHandoff();
        const key = url ?? handoffUrl ?? shareIntent.text ?? shareIntent.webUrl ?? 'unknown';
        if (handledKeyRef.current === key) return;
        handledKeyRef.current = key;

        if (handoffUrl) {
            allowReimportForUrl(handoffUrl);
        }
        if (url) {
            allowReimportForUrl(url);
        }

        const sameReel = Boolean(
            handoffUrl
            && url
            && normalizeImportUrl(handoffUrl) === normalizeImportUrl(url),
        );

        if (handoffUrl && (sameReel || !url)) {
            void refreshJobs();
            router.navigate('/onboarding/video-import');
            resetShareIntent();
            return;
        }

        if (url) {
            enqueueUrl(url);
            router.navigate('/onboarding/video-import');
        } else {
            router.navigate('/onboarding/video-import');
        }

        resetShareIntent();
    }, [
        appReady,
        isReady,
        hasShareIntent,
        user,
        shareIntent,
        resetShareIntent,
        enqueueUrl,
        refreshJobs,
        allowReimportForUrl,
        router,
        rootNavigationState?.key,
    ]);

    useEffect(() => {
        if (!hasShareIntent) handledKeyRef.current = null;
    }, [hasShareIntent]);

    return null;
}
