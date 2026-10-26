import { pathFromMemoryPublicUrl } from '@/lib/memoryImagePath';
import { supabase } from '@/lib/supabase';

export type DeleteOwnedMemoryMode = 'deleted' | 'archived';

export type DeleteOwnedMemoryResult =
    | { ok: true; mode: DeleteOwnedMemoryMode; imageUrl?: string }
    | { ok: false; error: string };

export async function deleteOwnedMemory(memoryId: string): Promise<DeleteOwnedMemoryResult> {
    const { data, error } = await supabase.rpc('delete_owned_memory', {
        p_memory_id: memoryId,
    });

    if (error) {
        return { ok: false, error: error.message };
    }

    const payload = data as {
        ok?: boolean;
        error?: string;
        mode?: DeleteOwnedMemoryMode;
        image_url?: string;
        thumb_uri?: string | null;
    } | null;
    if (!payload?.ok || !payload.mode) {
        return { ok: false, error: payload?.error ?? 'Delete failed.' };
    }

    if (payload.mode === 'deleted') {
        const urls = [payload.image_url, payload.thumb_uri].filter(
            (url): url is string => typeof url === 'string' && url.trim() !== '',
        );
        const storagePaths = [
            ...new Set(
                urls
                    .map((url) => pathFromMemoryPublicUrl(url))
                    .filter((path): path is string => path != null),
            ),
        ];
        if (storagePaths.length > 0) {
            const { error: storageError } = await supabase.storage.from('memories').remove(storagePaths);
            if (storageError) {
                console.error('Memo storage delete failed:', storageError.message);
            }
        }
    }

    return {
        ok: true,
        mode: payload.mode,
        imageUrl: payload.image_url,
    };
}
