import { compressLocalImageForUpload } from '@/lib/imageCompress';
import { getCountryNameFromCoords, normalizeLocationFolderName, toFolderLookupKey } from '@/lib/geocoding';
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

function coalesceImportSource(
    dbValue: unknown,
    metaValue: Memory['source'],
): Memory['source'] {
    const raw = dbValue != null && String(dbValue).trim() !== '' ? String(dbValue).trim() : '';
    if (raw === 'video_import') return 'video_import';
    return metaValue === 'video_import' ? 'video_import' : undefined;
}

function coalesceSourceUrl(dbValue: unknown, metaValue: string | undefined): string | undefined {
    if (dbValue != null && String(dbValue).trim() !== '') {
        return String(dbValue).trim();
    }
    return metaValue?.trim() ? metaValue.trim() : undefined;
}

/** One-time migration path: push legacy AsyncStorage-only import fields to Postgres for owned rows. */
async function backfillImportColumnsFromLocalMeta(
    userId: string,
    rows: any[],
    storedMeta: Record<string, MemoryMeta>,
): Promise<void> {
    const tasks = rows.map(async (item: any) => {
        const memoryId = item.id.toString();
        const meta = storedMeta[memoryId];
        if (!meta) return;

        const dbHasSource =
            item.source != null && String(item.source).trim() !== '';
        const dbHasUrl =
            item.source_url != null && String(item.source_url).trim() !== '';
        if (dbHasSource && dbHasUrl) return;

        const patch: { source?: string; source_url?: string } = {};
        if (!dbHasSource && meta.source === 'video_import') {
            patch.source = 'video_import';
        }
        if (!dbHasUrl && meta.sourceUrl?.trim()) {
            patch.source_url = meta.sourceUrl.trim();
        }
        if (Object.keys(patch).length === 0) return;

        await supabase
            .from('memories')
            .update(patch)
            .eq('id', memoryId)
            .eq('user_id', userId);
    });

    await Promise.all(tasks);
}

function mapLibraryRow(library: any, userId: string, roleByLibraryId: Record<string, CustomFolder['role']>): CustomFolder {
    const id = library.id.toString();
    return {
        id,
        name: library.name,
        created_at: library.created_at ?? new Date().toISOString(),
        owner_id: library.owner_id,
        role: roleByLibraryId[id],
        isShared: library.owner_id !== userId,
        coverImageUrl: typeof library.cover_image_url === 'string' ? library.cover_image_url : null,
    };
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

export type LoadUserMemoriesResult = ({ ok: true } & LoadedMemories) | { ok: false };

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
        .select('*')
        .in('id', libraryIds);

    if (librariesError || !libraryRows) {
        console.error('Could not load libraries:', librariesError?.message);
        return { folders: [], memoLibraryIdsMap: {}, libraryIds: [] };
    }

    const folders: CustomFolder[] = libraryRows
        .map((library: any) => mapLibraryRow(library, userId, roleByLibraryId))
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
            const source = coalesceImportSource(item.source, existingMeta.source);
            const sourceUrl = coalesceSourceUrl(item.source_url, existingMeta.sourceUrl);

            const rawDbCountry = item.country;
            const fromDb =
                rawDbCountry != null && String(rawDbCountry).trim() !== ''
                    ? normalizeLocationFolderName(String(rawDbCountry).trim())
                    : undefined;

            let country = fromDb;

            if (!country) {
                const metaC = existingMeta.country;
                const isUnknownPlaceholder =
                    typeof metaC === 'string' && metaC.trim().toLowerCase() === 'unknown location';
                const fromMeta =
                    metaC != null &&
                    String(metaC).trim() !== '' &&
                    !isUnknownPlaceholder
                        ? normalizeLocationFolderName(String(metaC).trim())
                        : undefined;
                country = fromMeta;
            }

            if (!country) {
                country = await getCountryNameFromCoords(item.latitude, item.longitude);
                nextMeta[memoryId] = {
                    country,
                    title,
                    description,
                    customFolderIds: memoLibraryIdsMap[memoryId] ?? [],
                    excludeFromCountryFolder: existingMeta.excludeFromCountryFolder ?? false,
                    source,
                    sourceUrl,
                };
                didUpdateMeta = true;
            } else if (country !== existingMeta.country) {
                nextMeta[memoryId] = {
                    country,
                    title,
                    description,
                    customFolderIds: memoLibraryIdsMap[memoryId] ?? [],
                    excludeFromCountryFolder: existingMeta.excludeFromCountryFolder ?? false,
                    source,
                    sourceUrl,
                };
                didUpdateMeta = true;
            }

            return {
                id: memoryId,
                uri: item.image_url,
                latitude: item.latitude,
                longitude: item.longitude,
                created_at: item.created_at ?? new Date().toISOString(),
                deletedAt: item.deleted_at ?? null,
                owner_id: item.user_id,
                isShared: item.user_id !== userId,
                country,
                title,
                description,
                customFolderIds: memoLibraryIdsMap[memoryId] ?? [],
                excludeFromCountryFolder: existingMeta.excludeFromCountryFolder ?? false,
                source,
                sourceUrl,
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
    options?: { title?: string; description?: string; source?: Memory['source']; sourceUrl?: string }
): Promise<{ persistedId: string; publicUrl: string } | null> {
    try {
        const fileName = `${tempId}.jpg`;
        const uriForUpload = await compressLocalImageForUpload(photoUri);
        const response = await fetch(uriForUpload);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error: storageError } = await supabase.storage
            .from('memories')
            .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage.from('memories').getPublicUrl(fileName);

        const titleVal = options?.title?.trim() || null;
        const descVal = options?.description?.trim() || null;

        const storedMeta = await loadMemoryMeta(userId);
        const tempMetaBefore = storedMeta[tempId];
        const resolvedSource =
            options?.source ?? tempMetaBefore?.source ?? null;
        const resolvedSourceUrl =
            (options?.sourceUrl ?? tempMetaBefore?.sourceUrl)?.trim() || null;

        const { data: insertedMemory, error: dbError } = await supabase
            .from('memories')
            .insert([{
                image_url: publicUrl,
                latitude,
                longitude,
                user_id: userId,
                title: titleVal,
                description: descVal,
                source: resolvedSource,
                source_url: resolvedSourceUrl,
                country: normalizeLocationFolderName(country),
                formatted_address: null,
            }])
            .select('id')
            .single();

        if (dbError) throw dbError;

        const persistedId = insertedMemory.id.toString();

        const nextMeta = { ...storedMeta };
        const tempMeta = nextMeta[tempId];
        delete nextMeta[tempId];
        nextMeta[persistedId] = {
            country,
            title: coalesceMetaText(titleVal, tempMeta?.title),
            description: coalesceMetaText(descVal, tempMeta?.description),
            customFolderIds: tempMeta?.customFolderIds ?? [],
            excludeFromCountryFolder: tempMeta?.excludeFromCountryFolder ?? false,
            source: coalesceImportSource(resolvedSource, tempMeta?.source),
            sourceUrl: coalesceSourceUrl(resolvedSourceUrl, tempMeta?.sourceUrl),
        };
        await saveMemoryMeta(userId, nextMeta);

        console.log('Background Sync Complete.');
        return { persistedId, publicUrl };
    } catch (err) {
        console.error('Cloud sync failed:', err);
        return null;
    }
}

export async function uploadLibraryCover(
    imageUri: string,
    folderId: string
): Promise<{ publicUrl: string } | null> {
    try {
        const fileName = `library-covers/${folderId}-${Date.now()}.jpg`;
        const uriForUpload = await compressLocalImageForUpload(imageUri);
        const response = await fetch(uriForUpload);
        const blob = await response.blob();
        const arrayBuffer = await new Response(blob).arrayBuffer();

        const { error: storageError } = await supabase.storage
            .from('memories')
            .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage.from('memories').getPublicUrl(fileName);

        return { publicUrl };
    } catch (error) {
        console.error('Library cover upload failed:', error);
        return null;
    }
}

export async function loadUserMemories(userId: string): Promise<LoadUserMemoriesResult> {
    const { data, error } = await supabase
        .from('memories')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null);

    if (error || !data) {
        console.error('Fetch Error:', error?.message);
        return { ok: false };
    }

    const storedMeta = await loadMemoryMeta(userId);
    await backfillImportColumnsFromLocalMeta(userId, data, storedMeta);

    await migrateLocalLibrariesToSupabase(userId, data);

    const { folders, memoLibraryIdsMap } = await fetchLibraryState(userId);
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
            .in('id', sharedMemoIds)
            .is('deleted_at', null);

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

    return {
        ok: true,
        memories: formattedMemories,
        customFolders: folders,
        sharedMap,
    };
}
