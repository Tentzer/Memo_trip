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

function normalizedUrl(value: string): string {
    return value.trim().toLowerCase();
}

/** Placeholder and empty covers are not a user photo. */
export function isUsableMemoryPhoto(uri: string | null | undefined): boolean {
    const value = trimmed(uri).toLowerCase();
    if (!value) return false;
    if (value.includes('placehold.co')) return false;
    if (value.includes('text=?') || value.includes('text=%3f')) return false;
    return true;
}

function memorySlide(memory: MemoryPhoto): GallerySlide | null {
    const full = trimmed(memory.uri);
    const thumb = trimmed(memory.thumb_uri);
    if (!isUsableMemoryPhoto(full) && !isUsableMemoryPhoto(thumb)) return null;
    const large = isUsableMemoryPhoto(full) ? full : thumb;
    const small = isUsableMemoryPhoto(thumb) ? thumb : large;
    if (!small) return null;
    return { id: 'memory', kind: 'memory', thumb: small, full: large || small };
}

function placeSlide(photo: PlacePhoto, index: number): GallerySlide | null {
    const thumb = trimmed(photo.thumb);
    const full = trimmed(photo.full);
    const small = thumb || full;
    const large = full || thumb;
    if (!small) return null;
    return { id: `place-${index}`, kind: 'place', thumb: small, full: large };
}

function slideUrls(slide: GallerySlide): string[] {
    return [normalizedUrl(slide.full), normalizedUrl(slide.thumb)].filter(Boolean);
}

function dedupeSlides(slides: GallerySlide[]): GallerySlide[] {
    const seen = new Set<string>();
    const unique: GallerySlide[] = [];
    for (const slide of slides) {
        const urls = slideUrls(slide);
        if (urls.length === 0 || urls.some((url) => seen.has(url))) continue;
        urls.forEach((url) => seen.add(url));
        unique.push(slide);
    }
    return unique;
}

/** Memory photo first when it is a real image, then place photos, without duplicates. */
export function buildGallerySlides(memory: MemoryPhoto, photos: readonly PlacePhoto[]): GallerySlide[] {
    const first = memorySlide(memory);
    const places = photos
        .slice(0, MAX_PLACE_PHOTOS)
        .map(placeSlide)
        .filter((slide): slide is GallerySlide => slide !== null);
    return dedupeSlides(first ? [first, ...places] : places);
}

export function withoutFailedSlides(slides: readonly GallerySlide[], failedIds: ReadonlySet<string>): GallerySlide[] {
    return slides.filter((slide) => !failedIds.has(slide.id));
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
