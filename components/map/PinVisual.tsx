import {
    IG_GRADIENT,
    MIXED_PIN_GRADIENT,
    OWNED_PIN_COLOR,
    SHARED_PIN_COLOR,
    markerStyles,
} from '@/components/map/markerStyles';
import { PlaceCategoryIcon } from '@/components/PlaceCategoryIcon';
import { useAppTheme } from '@/context/ThemeContext';
import { pinPlaceholderAppearance } from '@/lib/markerCategoryBadge';
import { ensureMarkerIconFonts } from '@/lib/markerIconFonts';
import { formatClusterCount } from '@/lib/mapMemoryPins';
import type { ClusterBitmapInput, PinBitmapInput } from '@/lib/pinBitmapKey';
import type { MemoryPlaceCategory } from '@/types/memory';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

void ensureMarkerIconFonts();

export const PIN_BITMAP_WIDTH = 72;
export const PIN_BITMAP_HEIGHT = 86;

type PinPhase = 'loading' | 'loaded' | 'error';

type ArtworkProps = {
    imageUri: string;
    phase: PinPhase;
    onLoad: () => void;
    onError: () => void;
    frame: 'owned' | 'shared';
    ring: 'owned' | 'shared' | 'mixed' | 'video';
    stem: string;
    badge?: string;
    category?: MemoryPlaceCategory | null;
    showCategoryBadge?: boolean;
};

function stemColor(variant: 'owned' | 'shared', video: boolean): string {
    if (video) return '#ee2a7b';
    return variant === 'owned' ? OWNED_PIN_COLOR : SHARED_PIN_COLOR;
}

export function PinArtwork({
    imageUri,
    phase,
    onLoad,
    onError,
    frame,
    ring,
    stem,
    badge,
    category,
    showCategoryBadge = false,
}: ArtworkProps) {
    const { theme } = useAppTheme();
    const sharedFrame = frame === 'shared';
    const accent = ring === 'shared' ? SHARED_PIN_COLOR : OWNED_PIN_COLOR;
    const showPhoto = imageUri.length > 0 && phase !== 'error';
    const showPlaceholder = phase === 'loading';
    const placeholder = pinPlaceholderAppearance(category);
    const face = (
        <View style={markerStyles.markerAvatarImage}>
            {showPlaceholder ? (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        markerStyles.markerPlaceholder,
                        { backgroundColor: placeholder.background },
                    ]}
                >
                    {category ? (
                        <PlaceCategoryIcon category={category} size={26} color={placeholder.icon} />
                    ) : (
                        <Ionicons name="image-outline" size={26} color={placeholder.icon} />
                    )}
                </View>
            ) : null}
            {showPhoto ? (
                <ExpoImage
                    key={imageUri}
                    recyclingKey={imageUri}
                    source={{ uri: imageUri }}
                    style={[markerStyles.markerPhoto, { opacity: phase === 'loaded' ? 1 : 0 }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    allowDownscaling
                    transition={0}
                    onLoad={onLoad}
                    onDisplay={onLoad}
                    onError={onError}
                />
            ) : null}
        </View>
    );
    const photoRing = ring === 'video' ? (
        <LinearGradient colors={IG_GRADIENT} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={markerStyles.markerAccentRing}>
            <View style={markerStyles.markerGradientInner}>{face}</View>
        </LinearGradient>
    ) : ring === 'mixed' ? (
        <LinearGradient colors={MIXED_PIN_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={markerStyles.markerAccentRing}>
            <View style={markerStyles.markerGradientInner}>{face}</View>
        </LinearGradient>
    ) : (
        <View style={[markerStyles.markerAccentRing, { borderColor: accent }]}>{face}</View>
    );

    return (
        <View style={markerStyles.markerPinWrapper} collapsable={false}>
            <View
                style={[
                    markerStyles.markerContainer,
                    markerStyles.markerAvatarOuter,
                    {
                        borderColor: sharedFrame ? SHARED_PIN_COLOR : 'transparent',
                        borderWidth: sharedFrame ? 3 : 0,
                        backgroundColor: sharedFrame ? theme.colors.surface : 'transparent',
                        width: sharedFrame ? 68 : 58,
                        height: sharedFrame ? 68 : 58,
                        borderRadius: sharedFrame ? 34 : 29,
                    },
                ]}
            >
                {photoRing}
            </View>
            <View style={[markerStyles.markerStem, { backgroundColor: stem }]} />
            {badge ? (
                <View style={markerStyles.countBadge}>
                    <Text allowFontScaling={false} style={markerStyles.countBadgeText}>{badge}</Text>
                </View>
            ) : null}
            {showCategoryBadge && category ? (
                <View style={markerStyles.categoryBadge}>
                    <PlaceCategoryIcon category={category} size={15} color="#374151" />
                </View>
            ) : null}
        </View>
    );
}

export function pinArtworkProps(input: PinBitmapInput, phase: PinPhase, onLoad: () => void, onError: () => void): ArtworkProps {
    return {
        imageUri: input.imageUri,
        phase,
        onLoad,
        onError,
        frame: input.variant,
        ring: input.video ? 'video' : input.variant,
        stem: stemColor(input.variant, input.video),
        category: input.badge,
        showCategoryBadge: input.badge != null,
    };
}

export function clusterArtworkProps(
    input: ClusterBitmapInput,
    phase: PinPhase,
    onLoad: () => void,
    onError: () => void,
): ArtworkProps {
    return {
        imageUri: input.imageUri,
        phase,
        onLoad,
        onError,
        frame: input.frame,
        ring: input.ring,
        stem: stemColor(input.variant, false),
        badge: formatClusterCount(input.count),
        category: null,
        showCategoryBadge: false,
    };
}

export function placeholderArtworkProps(phase: PinPhase, onLoad: () => void, onError: () => void): ArtworkProps {
    return pinArtworkProps({
        memoryId: 'placeholder',
        imageUri: '',
        badge: null,
        variant: 'owned',
        selected: false,
        video: false,
    }, phase === 'loading' ? 'error' : phase, onLoad, onError);
}
