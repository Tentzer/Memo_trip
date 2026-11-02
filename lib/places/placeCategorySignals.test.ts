import { MEMORY_PLACE_CATEGORIES } from '@/lib/placeCategory';
import {
    classifyPlaceText,
    mapBravePlaceCategory,
    mapGooglePlaceCategory,
} from '@/lib/places/placeCategorySignals';

describe('mapBravePlaceCategory', () => {
    it('reads the short description before cuisine', () => {
        expect(mapBravePlaceCategory({
            name: 'Afuri',
            description: 'Sushi Restaurant',
            servesCuisine: ['Japanese', 'Asian'],
            categories: ['restaurant'],
            iconCategory: 'restaurant',
        })).toBe('sushi');
    });

    it('maps ramen, cafe, and creperie descriptions', () => {
        expect(mapBravePlaceCategory({ description: 'Ramen Restaurant', name: 'Ippudo' })).toBe('ramen');
        expect(mapBravePlaceCategory({ description: 'Cafe', name: 'Blue Bottle' })).toBe('cafe');
        expect(mapBravePlaceCategory({ description: 'Creperie', name: 'Breizh' })).toBe('cafe');
    });

    it('uses the place name when the description is only a generic restaurant', () => {
        expect(mapBravePlaceCategory({
            description: 'Restaurant',
            name: 'Ichiran Ramen',
            categories: ['restaurant'],
        })).toBe('ramen');
    });

    it('maps serves_cuisine, including non-English Japanese labels, after the name', () => {
        expect(mapBravePlaceCategory({
            name: 'Afuri',
            servesCuisine: ['Japanese', 'Asian'],
        })).toBe('restaurant');
        expect(mapBravePlaceCategory({
            name: 'Taberna',
            servesCuisine: ['Japonesa'],
        })).toBe('restaurant');
        expect(mapBravePlaceCategory({
            name: 'Bistro',
            servesCuisine: ['Japonaise'],
        })).toBe('restaurant');
        expect(mapBravePlaceCategory({
            name: 'Sushiyaki',
            servesCuisine: ['Sushi', 'Japanese'],
        })).toBe('sushi');
    });

    it('uses categories and icon_category when the name and cuisine are empty', () => {
        expect(mapBravePlaceCategory({ categories: ['cafe'] })).toBe('cafe');
        expect(mapBravePlaceCategory({ iconCategory: 'restaurant' })).toBe('restaurant');
        expect(mapBravePlaceCategory({ categories: [], iconCategory: undefined })).toBeUndefined();
    });

    it('falls back to the title and description scorer', () => {
        expect(mapBravePlaceCategory({ name: 'Menya', description: '' })).toBe('ramen');
        expect(mapBravePlaceCategory({ name: 'Caffe Nero' })).toBe('cafe');
        expect(classifyPlaceText('Caffe Nero', '')).toBe('cafe');
    });

    it('only returns memory categories', () => {
        const category = mapBravePlaceCategory({
            name: 'Sushi Dai',
            description: 'Sushi Restaurant',
            servesCuisine: ['Japanese'],
            categories: ['restaurant'],
            iconCategory: 'restaurant',
        });
        expect(MEMORY_PLACE_CATEGORIES).toContain(category);
    });
});

describe('mapGooglePlaceCategory', () => {
    it('maps primaryType and types, preferring the more specific token', () => {
        expect(mapGooglePlaceCategory({
            primaryType: 'sushi_restaurant',
            types: ['restaurant', 'food', 'point_of_interest'],
        })).toBe('sushi');
        expect(mapGooglePlaceCategory({
            types: ['cafe', 'store', 'point_of_interest', 'establishment'],
        })).toBe('cafe');
        expect(mapGooglePlaceCategory({
            name: 'Ramen Ya',
            primaryType: 'restaurant',
            types: ['restaurant', 'food'],
        })).toBe('ramen');
    });

    it('maps common Google types onto memory categories', () => {
        expect(mapGooglePlaceCategory({ types: ['bakery', 'food'] })).toBe('bakery');
        expect(mapGooglePlaceCategory({ types: ['bar', 'point_of_interest'] })).toBe('bar');
        expect(mapGooglePlaceCategory({ types: ['tourist_attraction'] })).toBe('attraction');
        expect(mapGooglePlaceCategory({ types: ['shopping_mall', 'store'] })).toBe('shopping');
        expect(mapGooglePlaceCategory({ types: ['restaurant', 'food'] })).toBe('restaurant');
    });

    it('uses the text scorer when types are only generic map pins', () => {
        expect(mapGooglePlaceCategory({
            name: 'Caffe Nero',
            types: ['point_of_interest', 'establishment'],
        })).toBe('cafe');
    });
});
