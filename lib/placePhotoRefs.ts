/** Google Place Photo requests are billed per fetch. Keep a short list and do not preload extras. */
export const MAX_PLACE_PHOTO_REFS = 5;
export const PLACE_GALLERY_MAX_WIDTH = 1000;

export type PlacePhotoSlot =
    | { kind: 'stored' }
    | { kind: 'place'; ref: string };

export function takePlacePhotoRefs(
    photos: ReadonlyArray<{ photo_reference?: string | null }> | null | undefined,
): string[] {
    if (!photos) return [];
    const refs: string[] = [];
    for (const photo of photos) {
        const ref = photo?.photo_reference?.trim();
        if (!ref) continue;
        refs.push(ref);
        if (refs.length >= MAX_PLACE_PHOTO_REFS) break;
    }
    return refs;
}

export function normalizePlacePhotoRefs(raw: unknown): string[] | null {
    if (!Array.isArray(raw)) return null;
    const refs = raw
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim())
        .slice(0, MAX_PLACE_PHOTO_REFS);
    return refs.length > 0 ? refs : null;
}

/**
 * First slide is the photo already stored on the memory.
 * Later slides are the extra Place photo references and must not be fetched until swiped near.
 */
export function placeGallerySlots(storedUri: string, refs: readonly string[] | null | undefined): PlacePhotoSlot[] {
    const stored = storedUri.trim();
    const slots: PlacePhotoSlot[] = [];
    if (stored) slots.push({ kind: 'stored' });
    const extras = (normalizePlacePhotoRefs(refs) ?? []).slice(stored ? 1 : 0);
    for (const ref of extras) slots.push({ kind: 'place', ref });
    return slots;
}

/**
 * Index 0 is enabled immediately. A later index turns on once the swipe is 20% of the way toward it.
 */
export function enabledGalleryIndex(scrollOffset: number, pageWidth: number, slotCount: number): number {
    if (slotCount <= 1 || !Number.isFinite(pageWidth) || pageWidth <= 0) return 0;
    const progressed = Math.max(0, scrollOffset) / pageWidth;
    return Math.min(slotCount - 1, Math.max(0, Math.floor(progressed + 0.8)));
}

export function placePhotoRequestUrl(photoReference: string, apiKey: string, maxWidth = PLACE_GALLERY_MAX_WIDTH): string {
    const params = new URLSearchParams({
        maxwidth: String(maxWidth),
        photo_reference: photoReference,
        key: apiKey,
    });
    return `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;
}
