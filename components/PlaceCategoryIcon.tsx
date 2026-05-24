import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { placeCategoryIcon } from '@/lib/placeCategory';
import type { MemoryPlaceCategory } from '@/types/memory';

const MATERIAL_ICONS: Partial<
    Record<MemoryPlaceCategory, keyof typeof MaterialCommunityIcons.glyphMap>
> = {
    pasta: 'pasta',
    ramen: 'noodles',
    sushi: 'fish',
    bakery: 'cupcake',
};

type PlaceCategoryIconProps = {
    category: MemoryPlaceCategory;
    size: number;
    color: string;
};

export function PlaceCategoryIcon({ category, size, color }: PlaceCategoryIconProps) {
    const materialName = MATERIAL_ICONS[category];
    if (materialName) {
        return <MaterialCommunityIcons name={materialName} size={size} color={color} />;
    }
    return <Ionicons name={placeCategoryIcon(category)} size={size} color={color} />;
}
