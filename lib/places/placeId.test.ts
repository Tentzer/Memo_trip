import { isBravePlaceId, isGooglePlaceId, syntheticBravePlaceId } from '@/lib/places/placeId';
import { parsePlacesProvider } from '@/lib/places/providerName';
import { resolvePlaceCategoryForSave } from '@/lib/placeCategory';

describe('place ids', () => {
    it('keeps Google place ids distinct from Brave ids', () => {
        expect(isGooglePlaceId('ChIJabc123def456ghi789')).toBe(true);
        expect(isBravePlaceId('ChIJabc123def456ghi789')).toBe(false);
        expect(isGooglePlaceId('loc4G4LX7WYT25AUBNMX')).toBe(false);
        expect(isBravePlaceId('loc4G4LX7WYT25AUBNMX')).toBe(true);
        expect(isGooglePlaceId(syntheticBravePlaceId('Sushi Dai', 35.6, 139.7, 'Tokyo'))).toBe(false);
    });
});

describe('parsePlacesProvider', () => {
    it('defaults to brave and accepts google', () => {
        expect(parsePlacesProvider(undefined)).toBe('brave');
        expect(parsePlacesProvider('')).toBe('brave');
        expect(parsePlacesProvider('BRAVE')).toBe('brave');
        expect(parsePlacesProvider('google')).toBe('google');
        expect(parsePlacesProvider(' Google ')).toBe('google');
    });
});

describe('resolvePlaceCategoryForSave', () => {
    it('keeps a category the user or import already set', () => {
        expect(resolvePlaceCategoryForSave('sushi', 'restaurant')).toBe('sushi');
        expect(resolvePlaceCategoryForSave('cafe', undefined)).toBe('cafe');
    });

    it('uses the incoming category only when nothing is stored yet', () => {
        expect(resolvePlaceCategoryForSave(undefined, 'ramen')).toBe('ramen');
        expect(resolvePlaceCategoryForSave('nope', 'bar')).toBe('bar');
        expect(resolvePlaceCategoryForSave(undefined, 'not-a-category')).toBeUndefined();
    });
});
