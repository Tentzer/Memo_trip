import { describe, expect, it } from '@jest/globals';
import {
    MAX_PLACE_PHOTO_REFS,
    PLACE_GALLERY_MAX_WIDTH,
    enabledGalleryIndex,
    normalizePlacePhotoRefs,
    placeGallerySlots,
    placePhotoRequestUrl,
    takePlacePhotoRefs,
} from '@/lib/placePhotoRefs';

describe('place photo refs', () => {
    it('keeps at most five non-empty photo references in order', () => {
        const photos = [
            { photo_reference: ' a ' },
            { photo_reference: '' },
            { photo_reference: null },
            { photo_reference: 'b' },
            { photo_reference: 'c' },
            { photo_reference: 'd' },
            { photo_reference: 'e' },
            { photo_reference: 'f' },
        ];
        expect(takePlacePhotoRefs(photos)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(takePlacePhotoRefs(photos)).toHaveLength(MAX_PLACE_PHOTO_REFS);
        expect(takePlacePhotoRefs(null)).toEqual([]);
    });

    it('drops invalid stored refs', () => {
        expect(normalizePlacePhotoRefs([' one ', '', 'two'])).toEqual(['one', 'two']);
        expect(normalizePlacePhotoRefs('nope')).toBeNull();
        expect(normalizePlacePhotoRefs([])).toBeNull();
    });

    it('uses the stored photo first and does not repeat its place reference', () => {
        expect(placeGallerySlots('https://cdn/pin.jpg', ['first', 'second', 'third'])).toEqual([
            { kind: 'stored' },
            { kind: 'place', ref: 'second' },
            { kind: 'place', ref: 'third' },
        ]);
        expect(placeGallerySlots('https://cdn/pin.jpg', null)).toEqual([{ kind: 'stored' }]);
        expect(placeGallerySlots('  ', ['only'])).toEqual([{ kind: 'place', ref: 'only' }]);
    });

    it('does not enable the next photo until the swipe is near it', () => {
        expect(enabledGalleryIndex(0, 300, 5)).toBe(0);
        expect(enabledGalleryIndex(59, 300, 5)).toBe(0);
        expect(enabledGalleryIndex(60, 300, 5)).toBe(1);
        expect(enabledGalleryIndex(300, 300, 5)).toBe(1);
        expect(enabledGalleryIndex(360, 300, 5)).toBe(2);
        expect(enabledGalleryIndex(0, 0, 5)).toBe(0);
    });

    it('builds a gallery photo URL at the gallery max width', () => {
        const url = placePhotoRequestUrl('ref id', 'test-key');
        expect(url).toContain(`maxwidth=${PLACE_GALLERY_MAX_WIDTH}`);
        expect(url).toContain('photo_reference=ref+id');
        expect(url).toContain('key=test-key');
        expect(placePhotoRequestUrl('ref', 'test-key', 1000)).toContain('maxwidth=1000');
    });
});
