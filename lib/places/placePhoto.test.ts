import { placePhotoUri } from '@/lib/places/placePhoto';

describe('placePhotoUri', () => {
    it('returns Brave image URLs unchanged and builds a Google photo URL for a reference', () => {
        expect(placePhotoUri('https://img.example/1.jpg', 'google-key')).toBe('https://img.example/1.jpg');
        expect(placePhotoUri('abc123', 'google-key', 800)).toBe(
            'https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=abc123&key=google-key',
        );
        expect(placePhotoUri('abc123', undefined)).toBeNull();
        expect(placePhotoUri(null, 'google-key')).toBeNull();
    });
});
