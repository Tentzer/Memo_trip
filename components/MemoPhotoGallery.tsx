import {
    enabledGalleryIndex,
    placeGallerySlots,
    placePhotoRequestUrl,
    type PlacePhotoSlot,
} from '@/lib/placePhotoRefs';
import { Image as ExpoImage } from 'expo-image';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

type MemoPhotoGalleryProps = {
    storedUri: string;
    placePhotoRefs?: readonly string[] | null;
    googleApiKey?: string;
};

const GALLERY_HEIGHT = 200;

export default function MemoPhotoGallery({
    storedUri,
    placePhotoRefs,
    googleApiKey,
}: MemoPhotoGalleryProps) {
    const slots = useMemo(
        () => placeGallerySlots(storedUri, placePhotoRefs),
        [storedUri, placePhotoRefs],
    );
    const [pageWidth, setPageWidth] = useState(0);
    const [enabledThrough, setEnabledThrough] = useState(0);
    const [page, setPage] = useState(0);

    if (slots.length === 0) return null;

    if (slots.length === 1) {
        return (
            <ExpoImage
                source={{ uri: storedUri }}
                style={styles.single}
                contentFit="cover"
                transition={200}
            />
        );
    }

    return (
        <View
            style={styles.frame}
            onLayout={(event) => {
                const width = event.nativeEvent.layout.width;
                if (width > 0 && width !== pageWidth) setPageWidth(width);
            }}
        >
            {pageWidth > 0 ? (
                <ScrollView
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={32}
                    onScroll={(event) => {
                        const offset = event.nativeEvent.contentOffset.x;
                        const nextEnabled = enabledGalleryIndex(offset, pageWidth, slots.length);
                        setEnabledThrough((current) => (nextEnabled > current ? nextEnabled : current));
                        setPage(Math.min(slots.length - 1, Math.max(0, Math.round(offset / pageWidth))));
                    }}
                >
                    {slots.map((slot, index) => (
                        <GalleryPage
                            key={slot.kind === 'stored' ? 'stored' : slot.ref}
                            slot={slot}
                            storedUri={storedUri}
                            width={pageWidth}
                            enabled={index <= enabledThrough}
                            googleApiKey={googleApiKey}
                        />
                    ))}
                </ScrollView>
            ) : (
                <View style={styles.single} />
            )}
            <View style={styles.dots}>
                {slots.map((slot, index) => (
                    <View
                        key={slot.kind === 'stored' ? 'stored-dot' : slot.ref}
                        style={[styles.dot, index === page ? styles.dotActive : null]}
                    />
                ))}
            </View>
        </View>
    );
}

function GalleryPage({
    slot,
    storedUri,
    width,
    enabled,
    googleApiKey,
}: {
    slot: PlacePhotoSlot;
    storedUri: string;
    width: number;
    enabled: boolean;
    googleApiKey?: string;
}) {
    const uri = slot.kind === 'stored'
        ? storedUri
        : enabled && googleApiKey
            ? placePhotoRequestUrl(slot.ref, googleApiKey)
            : null;

    return (
        <View style={[styles.page, { width }]}>
            {uri ? (
                <ExpoImage source={{ uri }} style={styles.photo} contentFit="cover" />
            ) : (
                <View style={styles.photo} />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    frame: {
        marginBottom: 16,
    },
    single: {
        width: '100%',
        height: GALLERY_HEIGHT,
        borderRadius: 16,
        backgroundColor: '#e2e8f0',
        marginBottom: 16,
    },
    page: {
        height: GALLERY_HEIGHT,
    },
    photo: {
        width: '100%',
        height: GALLERY_HEIGHT,
        borderRadius: 16,
        backgroundColor: '#e2e8f0',
    },
    dots: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginTop: 8,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#cbd5e1',
    },
    dotActive: {
        backgroundColor: '#334155',
    },
});
