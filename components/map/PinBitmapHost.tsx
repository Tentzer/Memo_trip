import {
    PinArtwork,
    clusterArtworkProps,
    pinArtworkProps,
    placeholderArtworkProps,
} from '@/components/map/PinVisual';
import {
    PIN_BITMAP_CAPTURE_ATTEMPTS,
    PIN_BITMAP_CAPTURE_TIMEOUT_MS,
    PIN_BITMAP_POINT_HEIGHT,
    PIN_BITMAP_POINT_WIDTH,
    decidePinCapture,
    pinBitmapCaptureSize,
} from '@/lib/pinBitmapCapture';
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

function primaryUri(job: BitmapJob): string {
    if (job.spec.kind === 'placeholder') return '';
    return job.spec.imageUri;
}

function fallbackUri(job: BitmapJob): string {
    if (job.spec.kind === 'placeholder') return '';
    return job.spec.fallbackImageUri;
}

function nextPaint(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => resolve());
    });
}

function describeUri(uri: string): string {
    try {
        const url = new URL(uri);
        return `${url.origin}${url.pathname}`;
    } catch {
        return uri.slice(0, 80);
    }
}

function logPinBitmap(message: string, detail?: string) {
    if (!__DEV__) return;
    console.warn(`[pin-bitmap] ${message}`, detail ?? '');
}

export default function PinBitmapHost() {
    const viewRef = useRef<View>(null);
    const [job, setJob] = useState<BitmapJob | null>(null);
    const [phase, setPhase] = useState<Phase>('error');
    const [attempt, setAttempt] = useState(1);
    const [photoUri, setPhotoUri] = useState('');
    const [laidOut, setLaidOut] = useState(false);
    const jobRef = useRef<BitmapJob | null>(null);
    const phaseRef = useRef<Phase>('error');
    const attemptRef = useRef(1);
    const photoUriRef = useRef('');
    const captureGeneration = useRef(0);

    const acceptJob = useCallback((next: BitmapJob) => {
        const uri = primaryUri(next);
        attemptRef.current = 1;
        photoUriRef.current = uri;
        phaseRef.current = uri ? 'loading' : 'error';
        jobRef.current = next;
        setAttempt(1);
        setPhotoUri(uri);
        setPhase(phaseRef.current);
        setJob(next);
        if (uri) void Image.prefetch(uri).catch(() => undefined);
        const fallback = fallbackUri(next);
        if (fallback && fallback !== uri) void Image.prefetch(fallback).catch(() => undefined);
    }, []);

    useEffect(() => {
        registerPinBitmapRenderer(acceptJob);
        void requestPinBitmap(placeholderBitmapSpec(), true);
        return () => registerPinBitmapRenderer(null);
    }, [acceptJob]);

    const onFrameLayout = useCallback((event: LayoutChangeEvent) => {
        const { width, height } = event.nativeEvent.layout;
        setLaidOut(Math.round(width) >= PIN_BITMAP_POINT_WIDTH - 1 && Math.round(height) >= PIN_BITMAP_POINT_HEIGHT - 1);
    }, []);

    const missPhoto = useCallback((reason: string) => {
        const current = jobRef.current;
        if (!current || phaseRef.current !== 'loading') return;
        const decision = decidePinCapture({
            attempt: attemptRef.current,
            maxAttempts: PIN_BITMAP_CAPTURE_ATTEMPTS,
            photoLoaded: false,
            hasPhoto: photoUriRef.current.length > 0,
        });
        logPinBitmap(`${reason} ${describeUri(photoUriRef.current)} -> ${decision}`, current.key);
        if (decision === 'retry') {
            const fallback = fallbackUri(current);
            const nextUri = fallback && fallback !== photoUriRef.current ? fallback : photoUriRef.current;
            attemptRef.current += 1;
            photoUriRef.current = nextUri;
            phaseRef.current = nextUri ? 'loading' : 'error';
            setAttempt(attemptRef.current);
            setPhotoUri(nextUri);
            setPhase(phaseRef.current);
            if (nextUri) void Image.prefetch(nextUri).catch(() => undefined);
            return;
        }
        phaseRef.current = 'error';
        setPhase('error');
    }, []);

    useEffect(() => {
        if (!job || !laidOut || phase !== 'loading') return undefined;
        const timer = setTimeout(() => missPhoto('photo timed out'), PIN_BITMAP_CAPTURE_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [attempt, job, laidOut, missPhoto, phase, photoUri]);

    useEffect(() => {
        if (!job || !laidOut || phase === 'loading') return undefined;
        const generation = captureGeneration.current + 1;
        captureGeneration.current = generation;
        const run = async () => {
            try {
                await nextPaint();
                await nextPaint();
                if (captureGeneration.current !== generation || jobRef.current !== job) return;
                if (!viewRef.current) {
                    failPinBitmapJob(job);
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
                if (captureGeneration.current !== generation || jobRef.current !== job) return;
                completePinBitmapJob(job, tmpUri, phaseRef.current === 'loaded');
            } catch (error) {
                logPinBitmap(`capture threw ${error instanceof Error ? error.message : 'unknown'}`, job.key);
                if (captureGeneration.current === generation && jobRef.current === job) failPinBitmapJob(job);
            }
        };
        void run();
        return undefined;
    }, [attempt, job, laidOut, phase]);

    const onLoad = useCallback((loadedAttempt: number) => {
        if (attemptRef.current !== loadedAttempt || phaseRef.current !== 'loading') return;
        phaseRef.current = 'loaded';
        setPhase('loaded');
    }, []);
    const onError = useCallback(() => {
        missPhoto('photo failed');
    }, [missPhoto]);
    const artwork = job ? artworkForJob(job, photoUri, phase, attempt, onLoad, onError) : null;

    return (
        <View pointerEvents="none" style={styles.host}>
            <View ref={viewRef} collapsable={false} onLayout={onFrameLayout} style={styles.frame}>
                {artwork}
            </View>
        </View>
    );
}

function artworkForJob(
    job: BitmapJob,
    photoUri: string,
    phase: Phase,
    attempt: number,
    onLoad: (loadedAttempt: number) => void,
    onError: () => void,
) {
    const handleLoad = () => onLoad(attempt);
    if (job.spec.kind === 'cluster') {
        return (
            <PinArtwork
                key={`${attempt}:${photoUri}`}
                {...clusterArtworkProps({ ...job.spec, imageUri: photoUri }, phase, handleLoad, onError)}
            />
        );
    }
    if (job.spec.kind === 'pin') {
        return (
            <PinArtwork
                key={`${attempt}:${photoUri}`}
                {...pinArtworkProps({ ...job.spec, imageUri: photoUri }, phase, handleLoad, onError)}
            />
        );
    }
    return <PinArtwork {...placeholderArtworkProps(phase, handleLoad, onError)} />;
}

const styles = StyleSheet.create({
    host: {
        position: 'absolute',
        left: 0,
        top: 0,
        width: PIN_BITMAP_POINT_WIDTH,
        height: PIN_BITMAP_POINT_HEIGHT,
    },
    frame: {
        width: PIN_BITMAP_POINT_WIDTH,
        height: PIN_BITMAP_POINT_HEIGHT,
    },
});
