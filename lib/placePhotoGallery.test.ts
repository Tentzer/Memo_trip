import { describe, expect, it } from '@jest/globals';
import {
    MAX_PLACE_PHOTOS,
    buildGallerySlides,
    galleryView,
    type PlacePhoto,
} from '@/lib/placePhotoGallery';

const memory = { uri: 'https://cdn/memory-full.jpg', thumb_uri: 'https://cdn/memory-thumb.jpg' };

function place(index: number): PlacePhoto {
    return { thumb: `https://cdn/place-${index}-thumb.jpg`, full: `https://cdn/place-${index}-full.jpg` };
}

describe('place photo gallery', () => {
    it('puts the memory photo first and keeps place photos in order', () => {
        const photos = [place(1), place(2), place(3)];
        const slides = buildGallerySlides(memory, photos);
        expect(slides.map((slide) => slide.id)).toEqual(['memory', 'place-0', 'place-1', 'place-2']);
        expect(slides[0]).toMatchObject({ kind: 'memory', thumb: memory.thumb_uri, full: memory.uri });
        expect(slides[1]).toMatchObject({ kind: 'place', thumb: photos[0].thumb, full: photos[0].full });
        expect(slides[3].full).toBe(photos[2].full);
    });

    it('caps place photos at five', () => {
        const photos = Array.from({ length: MAX_PLACE_PHOTOS + 2 }, (_, index) => place(index));
        const slides = buildGallerySlides(memory, photos);
        expect(slides).toHaveLength(MAX_PLACE_PHOTOS + 1);
        expect(slides.filter((slide) => slide.kind === 'place')).toHaveLength(MAX_PLACE_PHOTOS);
        expect(slides[MAX_PLACE_PHOTOS].full).toBe(photos[MAX_PLACE_PHOTOS - 1].full);
        expect(slides.some((slide) => slide.full === photos[MAX_PLACE_PHOTOS].full)).toBe(false);
    });

    it('shows only the memory photo, with no dots, when there are no place photos', () => {
        const view = galleryView(memory, { photos: [], loading: false, error: null });
        expect(view.slides.map((slide) => slide.kind)).toEqual(['memory']);
        expect(view.showDots).toBe(false);
        expect(view.loading).toBe(false);
    });

    it('keeps the memory photo alone while loading and after an error', () => {
        const photos = [place(1), place(2)];
        const loading = galleryView(memory, { photos, loading: true, error: null });
        expect(loading.slides.map((slide) => slide.kind)).toEqual(['memory']);
        expect(loading.showDots).toBe(false);
        expect(loading.loading).toBe(true);

        const failed = galleryView(memory, { photos, loading: false, error: 'unavailable' });
        expect(failed.slides.map((slide) => slide.kind)).toEqual(['memory']);
        expect(failed.showDots).toBe(false);
        expect(failed.loading).toBe(false);
    });
});
