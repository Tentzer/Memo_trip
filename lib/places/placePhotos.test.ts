import { mapBravePlacePhotos, mapGooglePhotoReferences } from '@/lib/places/placePhotos';

describe('mapBravePlacePhotos', () => {
    it('uses the proxied src as the thumb and original as the full image', () => {
        const photos = mapBravePlacePhotos([
            { src: 'https://imgs.search.brave.com/a', original: 'https://cdn.example/a.jpg' },
            { src: 'https://imgs.search.brave.com/b' },
            { src: 'https://imgs.search.brave.com/logo', logo: true },
            { src: 'https://imgs.search.brave.com/dup', duplicated: true },
        ]);
        expect(photos).toEqual([
            { thumb: 'https://imgs.search.brave.com/a', full: 'https://cdn.example/a.jpg' },
            { thumb: 'https://imgs.search.brave.com/b', full: 'https://imgs.search.brave.com/b' },
        ]);
    });

    it('keeps at most five pictures', () => {
        const pictures = Array.from({ length: 8 }, (_, index) => ({
            src: `https://imgs.search.brave.com/${index}`,
            original: `https://cdn.example/${index}.jpg`,
        }));
        expect(mapBravePlacePhotos(pictures)).toHaveLength(5);
        expect(mapBravePlacePhotos(undefined)).toEqual([]);
    });
});

describe('mapGooglePhotoReferences', () => {
    it('builds thumb and full URLs with the photo helper and stops at five', () => {
        const references = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'];
        const photos = mapGooglePhotoReferences(references, 'google-key');
        expect(photos).toHaveLength(5);
        expect(photos[0]).toEqual({
            thumb: 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=r1&key=google-key',
            full: 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=r1&key=google-key',
        });
        expect(photos[4]?.thumb).toContain('photo_reference=r5');
        expect(mapGooglePhotoReferences(['ref'], undefined)).toEqual([]);
    });
});
