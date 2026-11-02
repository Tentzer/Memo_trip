import type { MemoryPlaceCategory } from '@/types/memory';

/**
 * Individual pins show a category badge only when the memory has one.
 * Clusters never show one, even if their newest photo has a category.
 */
export function categoryBadgeForMapMarker(
    marker: { type: 'pin'; placeCategory?: MemoryPlaceCategory | null } | { type: 'cluster' },
): MemoryPlaceCategory | null {
    if (marker.type === 'cluster') return null;
    return marker.placeCategory ?? null;
}

export type PinPlaceholderAppearance = {
    background: string;
    icon: string;
};

/** Soft circle behind the same icons used on the pin badge, one pair per category. */
const CATEGORY_PLACEHOLDER: Record<MemoryPlaceCategory, PinPlaceholderAppearance> = {
    restaurant: { background: '#FEF2F2', icon: '#DC2626' },
    pasta: { background: '#FFF7ED', icon: '#C2410C' },
    ramen: { background: '#FFF7ED', icon: '#EA580C' },
    sushi: { background: '#F0FDFA', icon: '#0F766E' },
    cafe: { background: '#FFFBEB', icon: '#B45309' },
    bar: { background: '#F5F3FF', icon: '#7C3AED' },
    bakery: { background: '#FDF2F8', icon: '#DB2777' },
    attraction: { background: '#EFF6FF', icon: '#1D4ED8' },
    shopping: { background: '#F0FDF4', icon: '#15803D' },
    other: { background: '#F1F5F9', icon: '#475569' },
};

/** Brand blue circle when the memory has no category. */
export const NEUTRAL_PIN_PLACEHOLDER: PinPlaceholderAppearance = {
    background: '#EFF6FF',
    icon: '#1D4ED8',
};

export function pinPlaceholderAppearance(
    category: MemoryPlaceCategory | null | undefined,
): PinPlaceholderAppearance {
    if (!category) return NEUTRAL_PIN_PLACEHOLDER;
    return CATEGORY_PLACEHOLDER[category];
}
