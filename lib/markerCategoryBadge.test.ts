import { describe, expect, it } from '@jest/globals';
import {
    NEUTRAL_PIN_PLACEHOLDER,
    categoryBadgeForMapMarker,
    pinPlaceholderAppearance,
} from '@/lib/markerCategoryBadge';
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

    it('gives each category its own placeholder colors and a brand fallback', () => {
        const seen = new Set<string>();
        for (const category of MEMORY_PLACE_CATEGORIES) {
            const appearance = pinPlaceholderAppearance(category);
            expect(appearance.background).toMatch(/^#[0-9A-F]{6}$/);
            expect(appearance.icon).toMatch(/^#[0-9A-F]{6}$/);
            seen.add(`${appearance.background}:${appearance.icon}`);
        }
        expect(seen.size).toBeGreaterThan(1);
        expect(pinPlaceholderAppearance(null)).toEqual(NEUTRAL_PIN_PLACEHOLDER);
        expect(pinPlaceholderAppearance(undefined)).toEqual(NEUTRAL_PIN_PLACEHOLDER);
    });
});
