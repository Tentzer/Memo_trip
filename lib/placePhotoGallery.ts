export type PlacePhoto = {
    thumb: string;
    full: string;
};

export type PlacePhotosResult = {
    photos: PlacePhoto[];
    loading: boolean;
    error: string | null;
};

export const MAX_PLACE_PHOTOS = 5;

export type GallerySlide = {
    id: string;
    kind: 'memory' | 'place';
    thumb: string;
    full: string;
};

type MemoryPhoto = {
    uri: string;
    thumb_uri?: string | null;
};

export type GalleryView = {
    slides: GallerySlide[];
    showDots: boolean;
    loading: boolean;
};

function trimmed(value: string | null | undefined): string {
    return value?.trim() ?? '';
}

function memorySlide(memory: MemoryPhoto): GallerySlide | null {
    const full = trimmed(memory.uri);
    const thumb = trimmed(memory.thumb_uri) || full;
    if (!thumb) return null;
    return { id: 'memory', kind: 'memory', thumb, full: full || thumb };
}

function placeSlide(photo: PlacePhoto, index: number): GallerySlide | null {
    const thumb = trimmed(photo.thumb);
    const full = trimmed(photo.full);
    const small = thumb || full;
    const large = full || thumb;
    if (!small) return null;
    return { id: `place-${index}`, kind: 'place', thumb: small, full: large };
}

/** Memory photo first, then at most five place photos, in the given order. */
export function buildGallerySlides(memory: MemoryPhoto, photos: readonly PlacePhoto[]): GallerySlide[] {
    const first = memorySlide(memory);
    if (!first) return [];
    const places = photos
        .slice(0, MAX_PLACE_PHOTOS)
        .map(placeSlide)
        .filter((slide): slide is GallerySlide => slide !== null);
    return [first, ...places];
}

/**
 * While place photos are loading, or when that request fails, the gallery is
 * only the memory photo and has no dots.
 */
export function galleryView(memory: MemoryPhoto | null, state: PlacePhotosResult): GalleryView {
    if (!memory) return { slides: [], showDots: false, loading: false };
    if (state.loading || state.error) {
        const slide = memorySlide(memory);
        return { slides: slide ? [slide] : [], showDots: false, loading: state.loading && !state.error };
    }
    const slides = buildGallerySlides(memory, state.photos);
    return { slides, showDots: slides.length > 1, loading: false };
}

/** Current slide upgrades to full. The next slide loads its thumb. The rest stay blank. */
export function slideLoadPlan(index: number, activeIndex: number): 'hidden' | 'thumb' | 'full' {
    if (index === activeIndex) return 'full';
    if (index === activeIndex + 1) return 'thumb';
    return 'hidden';
}
