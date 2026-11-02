import { usePlacePhotos } from '@/hooks/usePlacePhotos';
import { galleryView, slideLoadPlan, type GallerySlide } from '@/lib/placePhotoGallery';
import type { Memory } from '@/types/memory';
import { Image as ExpoImage } from 'expo-image';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Modal,
    Pressable,
    StyleSheet,
    View,
    type ListRenderItemInfo,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';

const GALLERY_HEIGHT = 200;

type MemoPhotoGalleryProps = {
    memory: Memory;
};

export default function MemoPhotoGallery({ memory }: MemoPhotoGalleryProps) {
    const placePhotos = usePlacePhotos(memory);
    const view = galleryView(memory, placePhotos);
    const [pageWidth, setPageWidth] = useState(0);
    const [activeIndex, setActiveIndex] = useState(0);
    const [fullScreen, setFullScreen] = useState(false);
    const slide = view.slides[activeIndex] ?? view.slides[0];

    const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (pageWidth <= 0) return;
        const next = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
        const clamped = Math.min(view.slides.length - 1, Math.max(0, next));
        setActiveIndex((current) => (current === clamped ? current : clamped));
    }, [pageWidth, view.slides.length]);

    if (view.slides.length === 0) return null;

    return (
        <View
            style={styles.frame}
            onLayout={(event) => {
                const width = Math.round(event.nativeEvent.layout.width);
                if (width > 0 && width !== pageWidth) setPageWidth(width);
            }}
        >
            {view.slides.length === 1 || pageWidth === 0 ? (
                <SlideImage slide={view.slides[0]} plan="full" onPress={() => setFullScreen(true)} />
            ) : (
                <FlatList
                    data={view.slides}
                    keyExtractor={(item) => item.id}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    directionalLockEnabled
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    initialNumToRender={2}
                    maxToRenderPerBatch={2}
                    windowSize={3}
                    getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
                    extraData={activeIndex}
                    onScroll={onScroll}
                    scrollEventThrottle={16}
                    renderItem={({ item, index }: ListRenderItemInfo<GallerySlide>) => (
                        <SlideImage
                            slide={item}
                            width={pageWidth}
                            plan={slideLoadPlan(index, activeIndex)}
                            onPress={() => setFullScreen(true)}
                        />
                    )}
                />
            )}
            {view.loading ? (
                <View pointerEvents="none" style={styles.loadingPill}>
                    <ActivityIndicator size="small" color="#ffffff" />
                </View>
            ) : null}
            {view.showDots ? (
                <View style={styles.dots}>
                    {view.slides.map((item, index) => (
                        <View
                            key={item.id}
                            style={[styles.dot, index === activeIndex ? styles.dotActive : null]}
                        />
                    ))}
                </View>
            ) : null}
            <Modal visible={fullScreen} transparent animationType="fade" onRequestClose={() => setFullScreen(false)}>
                <Pressable style={styles.fullScreen} onPress={() => setFullScreen(false)} accessibilityLabel="Close photo">
                    {slide ? (
                        <ExpoImage
                            source={{ uri: slide.full }}
                            placeholder={{ uri: slide.thumb }}
                            style={styles.fullImage}
                            contentFit="contain"
                            pointerEvents="none"
                        />
                    ) : null}
                </Pressable>
            </Modal>
        </View>
    );
}

function SlideImage({
    slide,
    width,
    plan,
    onPress,
}: {
    slide: GallerySlide;
    width?: number;
    plan: 'hidden' | 'thumb' | 'full';
    onPress: () => void;
}) {
    const source = plan === 'full' ? slide.full : slide.thumb;
    return (
        <Pressable
            onPress={onPress}
            style={[styles.page, width ? { width } : null]}
            accessibilityRole="button"
            accessibilityLabel={slide.kind === 'memory' ? 'Your photo' : 'Place photo'}
        >
            {plan === 'hidden' ? (
                <View style={styles.photo} />
            ) : (
                <ExpoImage
                    source={{ uri: source }}
                    placeholder={plan === 'full' ? { uri: slide.thumb } : undefined}
                    style={styles.photo}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                />
            )}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    frame: {
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
    loadingPill: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
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
    fullScreen: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.92)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    fullImage: {
        width: '100%',
        height: '100%',
    },
});
