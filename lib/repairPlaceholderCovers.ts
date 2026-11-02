import { pinImageUri } from '@/lib/mapMemoryPins';
import { memoryCoverFields } from '@/lib/memoryCover';
import type { PlacePhotoSource } from '@/lib/places/loadPlacePhotos';
import { coverUriFromPlacePhotos } from '@/lib/places/saveSearchedPlace';
import type { PlacePhoto } from '@/lib/places/placePhotos';
import type { Memory } from '@/types/memory';

type LoadPhotos = (source: PlacePhotoSource) => Promise<PlacePhoto[]>;

export function memoryNeedsCoverRepair(memory: Memory): boolean {
    if (memory.isShared || memory.deletedAt) return false;
    if (pinImageUri(memory)) return false;
    return Boolean(memory.placeId?.trim() || memory.title?.trim());
}

type UpdateCover = (
    memoryId: string,
    fields: { image_url: string; thumb_uri: string },
) => Promise<boolean>;

/**
 * One pass over loaded memories. Placeholder covers are replaced with the
 * place photo and written back. Memories that already have a real image are left alone.
 */
export async function repairPlaceholderCovers(
    memories: Memory[],
    deps: { loadPhotos?: LoadPhotos; updateCover: UpdateCover } = {
        updateCover: async () => false,
    },
): Promise<Memory[] | null> {
    const targets = memories.filter(memoryNeedsCoverRepair);
    if (targets.length === 0) return null;
    const loadPhotos = deps.loadPhotos ?? (async (source) => {
        const { loadPlacePhotos } = await import('@/lib/places/loadPlacePhotos');
        return loadPlacePhotos(source);
    });
    let changed = false;
    const next = await Promise.all(memories.map(async (memory) => {
        if (!memoryNeedsCoverRepair(memory)) return memory;
        try {
            const photos = await loadPhotos({
                id: memory.id,
                title: memory.title,
                latitude: memory.latitude,
                longitude: memory.longitude,
                placeId: memory.placeId,
            });
            const cover = coverUriFromPlacePhotos(photos);
            if (!cover) return memory;
            const fields = memoryCoverFields(cover);
            if (!fields.thumbUri) return memory;
            const saved = await deps.updateCover(memory.id, {
                image_url: fields.uri,
                thumb_uri: fields.thumbUri,
            });
            if (!saved) return memory;
            changed = true;
            return { ...memory, uri: fields.uri, thumb_uri: fields.thumbUri };
        } catch {
            return memory;
        }
    }));
    return changed ? next : null;
}
