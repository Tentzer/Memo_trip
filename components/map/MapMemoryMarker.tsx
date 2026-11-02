import {
    IG_GRADIENT,
    MIXED_PIN_GRADIENT,
    OWNED_PIN_COLOR,
    SHARED_PIN_COLOR,
    markerStyles,
} from '@/components/map/markerStyles';
import { useMarkerImageSnapshot, type MarkerImagePhase } from '@/components/map/useMarkerImageSnapshot';
import { useAppTheme } from '@/context/ThemeContext';
import { formatClusterCount, pinImageUri, type MapPinCluster } from '@/lib/mapMemoryPins';
import type { Memory } from '@/types/memory';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';

type PinFrame = 'owned' | 'shared';
type PinRing = 'owned' | 'shared' | 'mixed' | 'video';

type MapMemoryMarkerProps = {
    memory: Memory;
    variant: 'owned' | 'shared';
    onMarkerPress: (memory: Memory) => void;
};

type MapClusterMarkerProps = {
    cluster: MapPinCluster;
    onPress: (cluster: MapPinCluster) => void;
};

function stemColor(variant: 'owned' | 'shared', videoImport: boolean): string {
    if (videoImport) return '#ee2a7b';
    return variant === 'owned' ? OWNED_PIN_COLOR : SHARED_PIN_COLOR;
}

function PinBody({
    imageUri,
    phase,
    onLoad,
    onError,
    frame,
    ring,
    stem,
    badge,
}: {
    imageUri: string;
    phase: MarkerImagePhase;
    onLoad: () => void;
    onError: () => void;
    frame: PinFrame;
    ring: PinRing;
    stem: string;
    badge?: string;
}) {
    const { theme } = useAppTheme();
    const sharedFrame = frame === 'shared';
    const accent = ring === 'shared' ? SHARED_PIN_COLOR : OWNED_PIN_COLOR;
    const showPhoto = imageUri.length > 0 && phase !== 'error';
    const face = (
        <View style={markerStyles.markerAvatarImage}>
            {phase !== 'loaded' ? (
                <View style={[StyleSheet.absoluteFill, markerStyles.markerPlaceholder]}>
                    <Ionicons name="image-outline" size={22} color="#94a3b8" />
                </View>
            ) : null}
            {showPhoto ? (
                <ExpoImage
                    key={imageUri}
                    recyclingKey={imageUri}
                    source={{ uri: imageUri }}
                    style={[StyleSheet.absoluteFill, { opacity: phase === 'loaded' ? 1 : 0 }]}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                    onLoad={onLoad}
                    onError={onError}
                />
            ) : null}
        </View>
    );

    const photoRing = ring === 'video' ? (
        <LinearGradient
            colors={IG_GRADIENT}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={markerStyles.markerAccentRing}
        >
            <View style={markerStyles.markerGradientInner}>{face}</View>
        </LinearGradient>
    ) : ring === 'mixed' ? (
        <LinearGradient
            colors={MIXED_PIN_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={markerStyles.markerAccentRing}
        >
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
        </View>
    );
}

function MapMemoryMarkerComponent({ memory, variant, onMarkerPress }: MapMemoryMarkerProps) {
    const imageUri = pinImageUri(memory);
    const snapshot = useMarkerImageSnapshot(imageUri);
    const videoImport = memory.source === 'video_import';

    return (
        <Marker
            identifier={memory.id}
            coordinate={{ latitude: memory.latitude, longitude: memory.longitude }}
            zIndex={999}
            onPress={(event) => {
                event.stopPropagation?.();
                onMarkerPress(memory);
            }}
            tracksViewChanges={snapshot.tracksViewChanges}
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: 0 }}
            accessibilityLabel={variant === 'shared' ? 'Shared memo' : 'Your memo'}
        >
            <PinBody
                imageUri={imageUri}
                phase={snapshot.phase}
                onLoad={snapshot.onLoad}
                onError={snapshot.onError}
                frame={variant}
                ring={videoImport ? 'video' : variant}
                stem={stemColor(variant, videoImport)}
            />
        </Marker>
    );
}

function sameMemoryMarker(prev: MapMemoryMarkerProps, next: MapMemoryMarkerProps): boolean {
    return prev.variant === next.variant
        && prev.onMarkerPress === next.onMarkerPress
        && prev.memory.id === next.memory.id
        && prev.memory.uri === next.memory.uri
        && prev.memory.thumb_uri === next.memory.thumb_uri
        && prev.memory.latitude === next.memory.latitude
        && prev.memory.longitude === next.memory.longitude
        && prev.memory.source === next.memory.source;
}

export const MapMemoryMarker = React.memo(MapMemoryMarkerComponent, sameMemoryMarker);

function MapClusterMarkerComponent({ cluster, onPress }: MapClusterMarkerProps) {
    const imageUri = pinImageUri(cluster.newest.memory);
    const snapshot = useMarkerImageSnapshot(imageUri);
    const mixed = cluster.hasOwned && cluster.hasShared;
    const frame: PinFrame = !mixed && cluster.hasShared ? 'shared' : 'owned';
    const label = mixed
        ? `${cluster.count} memos, yours and shared`
        : cluster.hasShared
            ? `${cluster.count} shared memos`
            : `${cluster.count} of your memos`;

    return (
        <Marker
            identifier={cluster.id}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            zIndex={1000}
            onPress={(event) => {
                event.stopPropagation?.();
                onPress(cluster);
            }}
            tracksViewChanges={snapshot.tracksViewChanges}
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: 0 }}
            accessibilityLabel={label}
        >
            <PinBody
                imageUri={imageUri}
                phase={snapshot.phase}
                onLoad={snapshot.onLoad}
                onError={snapshot.onError}
                frame={frame}
                ring={mixed ? 'mixed' : frame}
                stem={stemColor(cluster.newest.variant, false)}
                badge={formatClusterCount(cluster.count)}
            />
        </Marker>
    );
}

function sameCluster(prev: MapClusterMarkerProps, next: MapClusterMarkerProps): boolean {
    return prev.onPress === next.onPress
        && prev.cluster.id === next.cluster.id
        && prev.cluster.count === next.cluster.count
        && prev.cluster.latitude === next.cluster.latitude
        && prev.cluster.longitude === next.cluster.longitude
        && prev.cluster.hasOwned === next.cluster.hasOwned
        && prev.cluster.hasShared === next.cluster.hasShared
        && prev.cluster.newest.variant === next.cluster.newest.variant
        && prev.cluster.newest.memory.id === next.cluster.newest.memory.id
        && prev.cluster.newest.memory.uri === next.cluster.newest.memory.uri
        && prev.cluster.newest.memory.thumb_uri === next.cluster.newest.memory.thumb_uri;
}

export const MapClusterMarker = React.memo(MapClusterMarkerComponent, sameCluster);
