import { Ionicons } from '@expo/vector-icons';

import type { MemoryPlaceCategory } from '@/types/memory';

export const MEMORY_PLACE_CATEGORIES = [
    'restaurant',
    'pasta',
    'ramen',
    'sushi',
    'cafe',
    'bar',
    'bakery',
    'attraction',
    'shopping',
    'other',
] as const satisfies readonly MemoryPlaceCategory[];

const CATEGORY_SET = new Set<string>(MEMORY_PLACE_CATEGORIES);

export function normalizePlaceCategory(raw: unknown): MemoryPlaceCategory | undefined {
    const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!value || !CATEGORY_SET.has(value)) return undefined;
    return value as MemoryPlaceCategory;
}

export function placeCategoryIcon(
    category: MemoryPlaceCategory,
): keyof typeof Ionicons.glyphMap {
    switch (category) {
        case 'restaurant':
            return 'restaurant-outline';
        case 'pasta':
            return 'restaurant-outline';
        case 'ramen':
            return 'restaurant-outline';
        case 'sushi':
            return 'restaurant-outline';
        case 'cafe':
            return 'cafe-outline';
        case 'bar':
            return 'wine-outline';
        case 'bakery':
            return 'cafe-outline';
        case 'attraction':
            return 'business-outline';
        case 'shopping':
            return 'bag-handle-outline';
        default:
            return 'location-outline';
    }
}

export function placeCategoryLabel(category: MemoryPlaceCategory): string {
    switch (category) {
        case 'restaurant':
            return 'Restaurant';
        case 'pasta':
            return 'Pasta';
        case 'ramen':
            return 'Ramen';
        case 'sushi':
            return 'Sushi';
        case 'cafe':
            return 'Cafe';
        case 'bar':
            return 'Bar';
        case 'bakery':
            return 'Bakery';
        case 'attraction':
            return 'Attraction';
        case 'shopping':
            return 'Shopping';
        default:
            return 'Other';
    }
}
