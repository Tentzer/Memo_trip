import { getSourcePlatform } from '@/lib/sourcePlatform';
import type { Memory } from '@/types/memory';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

const INSTAGRAM_GRADIENT = ['#f9ce34', '#ee2a7b', '#6228d7'] as const;
const TIKTOK_GRADIENT = ['#25f4ee', '#010101', '#fe2c55'] as const;
const FACEBOOK_BLUE = '#1877f2';

type MapMemoryMarkerProps = {
    memory: Memory;
    variant: 'owned' | 'shared';
    onMarkerPress: (memory: Memory) => void;
    sharedSurfaceColor: string;
};

/**
 * Custom map pin for a memo photo.
 *
 * Google Maps renders Marker children by snapshotting the view into a native
 * bitmap. The snapshot is only reliable when:
 * 1. The marker mounts after the map surface is ready (caller gates on that).
 * 2. `tracksViewChanges` stays true until the photo is actually drawn, then
 *    settles to false two frames after load so the committed frame contains
 *    the correct image. Flipping it inside `onLoad` freezes a blank or stale
 *    frame, which caused invisible pins and wrong photos.
 *
 * Uses core RN `Image` on purpose: `expo-image` recycles native views and
 * paints asynchronously, so the snapshot could capture another memo's photo.
 */
export default function MapMemoryMarker({
    memory,
    variant,
    onMarkerPress,
    sharedSurfaceColor,
}: MapMemoryMarkerProps) {
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const imageSettledRef = useRef(false);
    const isFirstRenderRef = useRef(true);

    const sourcePlatform =
        memory.source === 'video_import' ? getSourcePlatform(memory.sourceUrl) : null;
    const ringGradient =
        sourcePlatform === 'instagram'
            ? INSTAGRAM_GRADIENT
            : sourcePlatform === 'tiktok'
                ? TIKTOK_GRADIENT
                : null;
    const accentColor =
        sourcePlatform === 'instagram'
            ? '#ee2a7b'
            : sourcePlatform === 'tiktok'
                ? '#fe2c55'
                : sourcePlatform === 'facebook'
                    ? FACEBOOK_BLUE
                    : variant === 'owned' ? '#1d4ed8' : '#2563eb';

    const settleAfterFrames = useCallback(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setTracksViewChanges(false));
        });
    }, []);

    const handleImageSettled = useCallback(() => {
        imageSettledRef.current = true;
        settleAfterFrames();
    }, [settleAfterFrames]);

    useEffect(() => {
        if (!tracksViewChanges || imageSettledRef.current) return;
        const timeout = setTimeout(handleImageSettled, 8000);
        return () => clearTimeout(timeout);
    }, [tracksViewChanges, memory.uri, handleImageSettled]);

    useEffect(() => {
        if (isFirstRenderRef.current) return;
        // New photo: track again until the reloaded image settles via onLoadEnd.
        imageSettledRef.current = false;
        setTracksViewChanges(true);
    }, [memory.uri]);

    useEffect(() => {
        if (isFirstRenderRef.current) {
            isFirstRenderRef.current = false;
            return;
        }
        // Visual-only change (theme/variant): image is already loaded, so
        // re-track for one paint and settle again.
        setTracksViewChanges(true);
        if (imageSettledRef.current) settleAfterFrames();
    }, [variant, sharedSurfaceColor, settleAfterFrames]);

    return (
        <Marker
            coordinate={{
                latitude: memory.latitude,
                longitude: memory.longitude,
            }}
            onPress={() => onMarkerPress(memory)}
            tracksViewChanges={tracksViewChanges}
            anchor={{ x: 0.5, y: 1 }}
            identifier={memory.id}
            zIndex={variant === 'shared' ? 2 : 1}
        >
            <View style={styles.markerPinWrapper} collapsable={false}>
                <View
                    style={[
                        styles.markerContainer,
                        styles.markerAvatarOuter,
                        {
                            borderColor: variant === 'shared' ? '#7c3aed' : 'transparent',
                            borderWidth: variant === 'shared' ? 3 : 0,
                            backgroundColor: variant === 'shared' ? sharedSurfaceColor : 'transparent',
                            width: variant === 'shared' ? 68 : 58,
                            height: variant === 'shared' ? 68 : 58,
                            borderRadius: variant === 'shared' ? 34 : 29,
                        },
                    ]}
                >
                    {ringGradient ? (
                        <LinearGradient
                            colors={ringGradient}
                            start={{ x: 0, y: 1 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.markerGradientRing}
                        >
                            <Image
                                key={memory.uri}
                                source={{ uri: memory.uri }}
                                style={styles.markerGradientAvatarImage}
                                resizeMode="cover"
                                onLoadEnd={handleImageSettled}
                                onError={handleImageSettled}
                            />
                        </LinearGradient>
                    ) : (
                        <View style={[styles.markerAccentRing, { borderColor: accentColor }]} collapsable={false}>
                            <Image
                                key={memory.uri}
                                source={{ uri: memory.uri }}
                                style={styles.markerAvatarImage}
                                resizeMode="cover"
                                onLoadEnd={handleImageSettled}
                                onError={handleImageSettled}
                            />
                        </View>
                    )}
                </View>
                <View style={[styles.markerStem, { backgroundColor: accentColor }]} />
            </View>
        </Marker>
    );
}

const styles = StyleSheet.create({
    markerContainer: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 5,
    },
    markerPinWrapper: {
        alignItems: 'center',
    },
    markerAvatarOuter: {
        width: 68,
        height: 68,
        borderRadius: 34,
        borderWidth: 3,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerAccentRing: {
        width: 58,
        height: 58,
        borderRadius: 29,
        borderWidth: 2,
        overflow: 'hidden',
    },
    markerGradientRing: {
        width: 58,
        height: 58,
        borderRadius: 29,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    markerGradientAvatarImage: {
        width: 51,
        height: 51,
        borderRadius: 25.5,
    },
    markerAvatarImage: {
        width: 54,
        height: 54,
        borderRadius: 27,
    },
    markerStem: {
        width: 3,
        height: 16,
        borderRadius: 2,
        marginTop: -5,
    },
});
