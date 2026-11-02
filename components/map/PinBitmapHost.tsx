import {
    PinArtwork,
    clusterArtworkProps,
    pinArtworkProps,
    placeholderArtworkProps,
} from '@/components/map/PinVisual';
import { pinBitmapCaptureSize, PIN_BITMAP_POINT_HEIGHT, PIN_BITMAP_POINT_WIDTH } from '@/lib/pinBitmapCapture';
import {
    completePinBitmapJob,
    failPinBitmapJob,
    placeholderBitmapSpec,
    registerPinBitmapRenderer,
    requestPinBitmap,
    type BitmapJob,
} from '@/lib/pinBitmapQueue';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { captureRef } from 'react-native-view-shot';

type Phase = 'loading' | 'loaded' | 'error';

function jobImageUri(job: BitmapJob): string {
    if (job.spec.kind === 'placeholder') return '';
    return job.spec.imageUri;
}

function nextPaint(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}

export default function PinBitmapHost() {
    const viewRef = useRef<View>(null);
    const [job, setJob] = useState<BitmapJob | null>(null);
    const [phase, setPhase] = useState<Phase>('error');
    const [laidOut, setLaidOut] = useState(false);
    const capturingRef = useRef(false);
    const jobRef = useRef<BitmapJob | null>(null);
    const phaseRef = useRef<Phase>('error');
    const acceptJob = useCallback((next: BitmapJob) => {
        const uri = jobImageUri(next);
        const nextPhase: Phase = uri ? 'loading' : 'error';
        jobRef.current = next;
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
        setJob(next);
        if (uri) void Image.prefetch(uri).catch(() => undefined);
    }, []);

    useEffect(() => {
        registerPinBitmapRenderer(acceptJob);
        void requestPinBitmap(placeholderBitmapSpec(), true);
        return () => registerPinBitmapRenderer(null);
    }, [acceptJob]);

    const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setLaidOut(
            Math.round(width) === PIN_BITMAP_POINT_WIDTH
            && Math.round(height) === PIN_BITMAP_POINT_HEIGHT,
        );
    }, []);

    const capture = useCallback(async (current: BitmapJob) => {
        if (!viewRef.current || capturingRef.current) return;
        capturingRef.current = true;
        try {
            await nextPaint();
            await nextPaint();
            if (jobRef.current !== current) return;
            if (!viewRef.current) {
                failPinBitmapJob(current);
                return;
            }
            const size = pinBitmapCaptureSize();
            const tmpUri = await captureRef(viewRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                width: size.width,
                height: size.height,
            });
            if (jobRef.current !== current) return;
            completePinBitmapJob(current, tmpUri);
        } catch {
            if (jobRef.current === current) failPinBitmapJob(current);
        } finally {
            capturingRef.current = false;
            const latest = jobRef.current;
            if (latest && latest !== current && phaseRef.current !== 'loading') {
                void capture(latest);
            }
        }
    }, []);

    useEffect(() => {
        if (!job || !laidOut || phase === 'loading') return undefined;
        void capture(job);
        return undefined;
    }, [capture, job, laidOut, phase]);

    const onLoad = useCallback(() => {
        phaseRef.current = 'loaded';
        setPhase('loaded');
    }, []);
    const onError = useCallback(() => {
        phaseRef.current = 'error';
        setPhase('error');
    }, []);
    const artwork = job ? artworkForJob(job, phase, onLoad, onError) : null;

    return (
        <View pointerEvents="none" style={styles.host}>
            <View ref={viewRef} collapsable={false} onLayout={onFrameLayout} style={styles.frame}>
                {artwork}
            </View>
        </View>
    );
}

function artworkForJob(job: BitmapJob, phase: Phase, onLoad: () => void, onError: () => void) {
    if (job.spec.kind === 'cluster') return <PinArtwork {...clusterArtworkProps(job.spec, phase, onLoad, onError)} />;
    if (job.spec.kind === 'pin') return <PinArtwork {...pinArtworkProps(job.spec, phase, onLoad, onError)} />;
    return <PinArtwork {...placeholderArtworkProps(phase, onLoad, onError)} />;
}

const styles = StyleSheet.create({
    host: {
        position: 'absolute',
        left: -PIN_BITMAP_POINT_WIDTH * 4,
        top: 0,
        width: PIN_BITMAP_POINT_WIDTH,
        height: PIN_BITMAP_POINT_HEIGHT,
    },
    frame: {
        width: PIN_BITMAP_POINT_WIDTH,
        height: PIN_BITMAP_POINT_HEIGHT,
    },
});
