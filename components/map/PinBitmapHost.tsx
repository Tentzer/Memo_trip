import {
    PIN_BITMAP_HEIGHT,
    PIN_BITMAP_WIDTH,
    PinArtwork,
    clusterArtworkProps,
    pinArtworkProps,
    placeholderArtworkProps,
} from '@/components/map/PinVisual';
import {
    completePinBitmapJob,
    failPinBitmapJob,
    placeholderBitmapSpec,
    registerPinBitmapRenderer,
    requestPinBitmap,
    type BitmapJob,
} from '@/lib/pinBitmapQueue';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

type Phase = 'loading' | 'loaded' | 'error';

function jobImageUri(job: BitmapJob): string {
    if (job.spec.kind === 'placeholder') return '';
    return job.spec.imageUri;
}

export default function PinBitmapHost() {
    const viewRef = useRef<View>(null);
    const [job, setJob] = useState<BitmapJob | null>(null);
    const [phase, setPhase] = useState<Phase>('error');
    const capturingRef = useRef(false);
    const jobRef = useRef<BitmapJob | null>(null);
    const phaseRef = useRef<Phase>('error');
    const acceptJob = useCallback((next: BitmapJob) => {
        const nextPhase: Phase = jobImageUri(next) ? 'loading' : 'error';
        jobRef.current = next;
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
        setJob(next);
    }, []);

    useEffect(() => {
        registerPinBitmapRenderer(acceptJob);
        void requestPinBitmap(placeholderBitmapSpec(), true);
        return () => registerPinBitmapRenderer(null);
    }, [acceptJob]);

    const capture = useCallback(async (current: BitmapJob) => {
        if (!viewRef.current || capturingRef.current) return;
        capturingRef.current = true;
        try {
            const scale = PixelRatio.get();
            const tmpUri = await captureRef(viewRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile',
                width: Math.round(PIN_BITMAP_WIDTH * scale),
                height: Math.round(PIN_BITMAP_HEIGHT * scale),
            });
            completePinBitmapJob(current, tmpUri);
        } catch {
            failPinBitmapJob(current);
        } finally {
            capturingRef.current = false;
            const latest = jobRef.current;
            if (latest && latest !== current && phaseRef.current !== 'loading') {
                void capture(latest);
            }
        }
    }, []);

    useEffect(() => {
        if (!job || phase === 'loading') return undefined;
        const frame = requestAnimationFrame(() => {
            void capture(job);
        });
        return () => cancelAnimationFrame(frame);
    }, [capture, job, phase]);

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
            <View ref={viewRef} collapsable={false} style={styles.frame}>
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
        left: -PIN_BITMAP_WIDTH * 4,
        top: 0,
        width: PIN_BITMAP_WIDTH,
        height: PIN_BITMAP_HEIGHT,
    },
    frame: {
        width: PIN_BITMAP_WIDTH,
        height: PIN_BITMAP_HEIGHT,
    },
});
