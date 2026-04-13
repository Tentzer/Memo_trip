import { getCountryNameFromCoords, toFolderLookupKey } from '@/lib/geocoding';
import {
    getCustomFoldersStorageKey,
    getLibrariesMigratedKey,
    loadMemoryMeta,
    saveMemoryMeta,
} from '@/lib/memoryStorage';
import { supabase } from '@/lib/supabase';
import { CustomFolder, Memory, MemoryMeta } from '@/types/memory';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Prefer Supabase row; fall back to local MemoryMeta (legacy / offline). */
function coalesceMetaText(dbValue: unknown, metaValue: string | undefined): string | undefined {
    if (dbValue != null && String(dbValue).trim() !== '') {
        return String(dbValue).trim();
    }
    return metaValue;
}

export interface LibraryState {
    folders: CustomFolder[];
    memoLibraryIdsMap: Record<string, string[]>;
    libraryIds: string[];
}

export interface LoadedMemories {
    memories: Memory[];
    customFolders: CustomFolder[];
    sharedMap: Record<string, Memory[]>;
}

export async function fetchLibraryState(userId: string): Promise<LibraryState> {
    const { data: memberRows, error: membersError } = await supabase
        .from('library_members')
        .select('library_id, role')
        .eq('user_id', userId);

    if (membersError || !memberRows || memberRows.length === 0) {
        return { folders: [], memoLibraryIdsMap: {}, libraryIds: [] };
    }

    const roleByLibraryId = memberRows.reduce<Record<string, CustomFolder['role']>>((acc, row: any) => {
        acc[row.library_id.toString()] = row.role as CustomFolder['role'];
        return acc;
    }, {});

    const libraryIds = Object.keys(roleByLibraryId);
    const { data: libraryRows, error: librariesError } = await supabase
        .from('libraries')
        .select('id, owner_id, name, created_at')
        .in('id', libraryIds);

    if (librariesError || !libraryRows) {
        console.error('Could not load libraries:', librariesError?.message);
        return { folders: [], memoLibraryIdsMap: {}, libraryIds: [] };
    }

    const folders: CustomFolder[] = libraryRows
        .map((library: any) => {
            const id = library.id.toString();
            return {
                id,
                name: library.name,
                created_at: library.created_at ?? new Date().toISOString(),
                owner_id: library.owner_id,
                role: roleByLibraryId[id],
                isShared: library.owner_id !== userId,
            };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

    const { data: libraryMemoRows, error: libraryMemosError } = await supabase
        .from('library_memos')
        .select('library_id, memo_id')
        .in('library_id', libraryIds);

    if (libraryMemosError || !libraryMemoRows) {
        console.error('Could not load library memos:', libraryMemosError?.message);
        return { folders, memoLibraryIdsMap: {}, libraryIds };
    }

    const memoLibraryIdsMap = libraryMemoRows.reduce<Record<string, string[]>>((acc, row: any) => {
        const memoId = row.memo_id.toString();
        const libraryId = row.library_id.toString();
        const existing = acc[memoId] ?? [];
        if (!existing.includes(libraryId)) {
            acc[memoId] = [...existing, libraryId];
        }
        return acc;
    }, {});

    return { folders, memoLibraryIdsMap, libraryIds };
}

export async function migrateLocalLibrariesToSupabase(userId: string, rawMemories: any[]): Promise<void> {
    const hasMigrated = await AsyncStorage.getItem(getLibrariesMigratedKey(userId));
    if (hasMigrated) return;

    try {
        const storedFoldersValue = await AsyncStorage.getItem(getCustomFoldersStorageKey(userId));
        const localFolders: Array<{ id: string; name: string; created_at: string }> = storedFoldersValue
            ? JSON.parse(storedFoldersValue)
            : [];

        if (localFolders.length === 0) {
            await AsyncStorage.setItem(getLibrariesMigratedKey(userId), 'done');
            return;
        }

        const { data: existingLibraries } = await supabase
            .from('libraries')
            .select('id, name')
            .eq('owner_id', userId);

        const existingByName = new Map<string, string>();
        (existingLibraries ?? []).forEach((library: any) => {
            existingByName.set(toFolderLookupKey(library.name), library.id.toString());
        });

        const folderIdMap = new Map<string, string>();

        for (const folder of localFolders) {
            const normalizedName = toFolderLookupKey(folder.name);
            const existingId = existingByName.get(normalizedName);

            if (existingId) {
                folderIdMap.set(folder.id, existingId);
                continue;
            }

            const { data: insertedLibrary, error: insertLibraryError } = await supabase
                .from('libraries')
                .insert([{ owner_id: userId, name: folder.name, created_at: folder.created_at }])
                .select('id')
                .single();

            if (insertLibraryError || !insertedLibrary) {
                console.error('Could not migrate local folder:', insertLibraryError?.message);
                continue;
            }

            const newLibraryId = insertedLibrary.id.toString();
            folderIdMap.set(folder.id, newLibraryId);
            existingByName.set(normalizedName, newLibraryId);

            await supabase.from('library_members').upsert(
                [{ library_id: newLibraryId, user_id: userId, role: 'owner' }],
                { onConflict: 'library_id,user_id' }
            );
        }

        const validMemoryIds = new Set(rawMemories.map((m: any) => m.id.toString()));
        const storedMeta = await loadMemoryMeta(userId);
        const libraryMemoRows: Array<{ library_id: string; memo_id: string; added_by: string }> = [];

        Object.entries(storedMeta).forEach(([memoryId, meta]) => {
            if (!validMemoryIds.has(memoryId)) return;
            meta.customFolderIds.forEach((localFolderId) => {
                const remoteLibraryId = folderIdMap.get(localFolderId);
                if (!remoteLibraryId) return;
                libraryMemoRows.push({ library_id: remoteLibraryId, memo_id: memoryId, added_by: userId });
            });
        });

        if (libraryMemoRows.length > 0) {
            await supabase.from('library_memos').upsert(libraryMemoRows, { onConflict: 'library_id,memo_id' });
        }

        await AsyncStorage.setItem(getLibrariesMigratedKey(userId), 'done');
    } catch (error) {
        console.error('Local library migration failed:', error);
    }
}

export async function buildFormattedMemories(
    rawMemories: any[],
    userId: string,
    memoLibraryIdsMap: Record<string, string[]>,
    storedMeta: Record<string, MemoryMeta>,
    nextMeta: Record<string, MemoryMeta>
): Promise<{ formattedMemories: Memory[]; didUpdateMeta: boolean }> {
    let didUpdateMeta = false;

    const formattedMemories: Memory[] = await Promise.all(
        rawMemories.map(async (item: any) => {
            const memoryId = item.id.toString();
            const existingMeta = nextMeta[memoryId] ?? storedMeta[memoryId] ?? { customFolderIds: [] };
            const title = coalesceMetaText(item.title, existingMeta.title);
            const description = coalesceMetaText(item.description, existingMeta.description);
            let country = existingMeta.country;

            if (!country) {
                country = await getCountryNameFromCoords(item.latitude, item.longitude);
                nextMeta[memoryId] = {
                    country,
                    title,
                    description,
                    customFolderIds: memoLibraryIdsMap[memoryId] ?? [],
                    excludeFromCountryFolder: existingMeta.excludeFromCountryFolder ?? false,
                };
                didUpdateMeta = true;
            }

            return {
                id: memoryId,
                uri: item.image_url,
                latitude: item.latitude,
                longitude: item.longitude,
                created_at: item.created_at ?? new Date().toISOString(),
                owner_id: item.user_id,
                isShared: item.user_id !== userId,
                country,
                title,
                description,
                customFolderIds: memoLibraryIdsMap[memoryId] ?? [],
                excludeFromCountryFolder: existingMeta.excludeFromCountryFolder ?? false,
            };
        })
    );

    return { formattedMemories, didUpdateMeta };
}

export async function uploadPicture(
    photoUri: string,
    latitude: number,
    longitude: number,
    tempId: string,
    country: string,
    userId: string,
    options?: { title?: string; description?: string }
): Promise<{ persistedId: string; publicUrl: string } | null> {
    try {
        const fileName = `${tempId}.jpg`;
        const response = await fetch(photoUri);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error: storageError } = await supabase.storage
            .from('memories')
            .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage.from('memories').getPublicUrl(fileName);

        const titleVal = options?.title?.trim() || null;
        const descVal = options?.description?.trim() || null;

        const { data: insertedMemory, error: dbError } = await supabase
            .from('memories')
            .insert([{
                image_url: publicUrl,
                latitude,
                longitude,
                user_id: userId,
                title: titleVal,
                description: descVal,
            }])
            .select('id')
            .single();

        if (dbError) throw dbError;

        const persistedId = insertedMemory.id.toString();

        const storedMeta = await loadMemoryMeta(userId);
        const nextMeta = { ...storedMeta };
        const tempMeta = nextMeta[tempId];
        delete nextMeta[tempId];
        nextMeta[persistedId] = {
            country,
            title: coalesceMetaText(titleVal, tempMeta?.title),
            description: coalesceMetaText(descVal, tempMeta?.description),
            customFolderIds: tempMeta?.customFolderIds ?? [],
            excludeFromCountryFolder: tempMeta?.excludeFromCountryFolder ?? false,
        };
        await saveMemoryMeta(userId, nextMeta);

        console.log('Background Sync Complete.');
        return { persistedId, publicUrl };
    } catch (err) {
        console.error('Cloud sync failed:', err);
        return null;
    }
}

export async function loadUserMemories(userId: string): Promise<LoadedMemories> {
    const { data, error } = await supabase.from('memories').select('*').eq('user_id', userId);

    if (error || !data) {
        console.error('Fetch Error:', error?.message);
        return { memories: [], customFolders: [], sharedMap: {} };
    }

    await migrateLocalLibrariesToSupabase(userId, data);

    const { folders, memoLibraryIdsMap } = await fetchLibraryState(userId);
    const storedMeta = await loadMemoryMeta(userId);
    const nextMeta: Record<string, MemoryMeta> = { ...storedMeta };

    const { formattedMemories, didUpdateMeta } = await buildFormattedMemories(
        data, userId, memoLibraryIdsMap, storedMeta, nextMeta
    );

    const ownedMemoryIds = new Set(data.map((item: any) => item.id.toString()));
    const sharedMemoIds = Object.keys(memoLibraryIdsMap).filter((id) => !ownedMemoryIds.has(id));

    let sharedMap: Record<string, Memory[]> = {};

    if (sharedMemoIds.length > 0) {
        const { data: sharedMemoryRows, error: sharedError } = await supabase
            .from('memories')
            .select('*')
            .in('id', sharedMemoIds);

        if (sharedError || !sharedMemoryRows) {
            console.error('Could not load shared library memos:', sharedError?.message);
        } else {
            const { formattedMemories: formattedShared, didUpdateMeta: didUpdateSharedMeta } =
                await buildFormattedMemories(sharedMemoryRows, userId, memoLibraryIdsMap, storedMeta, nextMeta);

            sharedMap = formattedShared.reduce<Record<string, Memory[]>>((acc, memory) => {
                memory.customFolderIds.forEach((libraryId) => {
                    acc[libraryId] = [...(acc[libraryId] ?? []), memory];
                });
                return acc;
            }, {});

            Object.keys(sharedMap).forEach((libraryId) => {
                sharedMap[libraryId] = sharedMap[libraryId].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                );
            });

            if (didUpdateSharedMeta) {
                await saveMemoryMeta(userId, nextMeta);
            }
        }
    }

    if (didUpdateMeta) {
        await saveMemoryMeta(userId, nextMeta);
    }

    return { memories: formattedMemories, customFolders: folders, sharedMap };
}
