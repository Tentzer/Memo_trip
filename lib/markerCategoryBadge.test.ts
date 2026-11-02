import { describe, expect, it } from '@jest/globals';
import { categoryBadgeForMapMarker } from '@/lib/markerCategoryBadge';
import { MEMORY_PLACE_CATEGORIES } from '@/lib/placeCategory';

describe('map pin category badge', () => {
    it('shows the category on an individual pin and hides it when the pin has none', () => {
        for (const category of MEMORY_PLACE_CATEGORIES) {
            expect(categoryBadgeForMapMarker({ type: 'pin', placeCategory: category })).toBe(category);
        }
        expect(categoryBadgeForMapMarker({ type: 'pin' })).toBeNull();
        expect(categoryBadgeForMapMarker({ type: 'pin', placeCategory: null })).toBeNull();
    });

    it('shows no badge on a cluster', () => {
        expect(categoryBadgeForMapMarker({ type: 'cluster' })).toBeNull();
    });
});
