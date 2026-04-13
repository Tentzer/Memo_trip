import { useCallback } from 'react';
import { Alert } from 'react-native';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Memory, CustomFolder } from '@/types/memory';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { toDisplayFolderName, toFolderLookupKey } from '@/lib/geocoding';

interface Params {
    user: User | null;
    memories: Memory[];
    customFolders: CustomFolder[];
    sharedLibraryMemoriesByLibraryId: Record<string, Memory[]>;
    memoriesRef: React.MutableRefObject<Memory[]>;
    customFoldersRef: React.MutableRefObject<CustomFolder[]>;
    setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
    setCustomFolders: React.Dispatch<React.SetStateAction<CustomFolder[]>>;
    setSharedLibraryMemoriesByLibraryId: React.Dispatch<React.SetStateAction<Record<string, Memory[]>>>;
}

export function useLibraries({
    user,
    memories,
    sharedLibraryMemoriesByLibraryId,
    memoriesRef,
    customFoldersRef,
    setMemories,
    setCustomFolders,
    setSharedLibraryMemoriesByLibraryId,
}: Params) {

    const getLibraryMemories = useCallback((folderId: string): Memory[] => {
        const ownedMemories = memories.filter(m => m.customFolderIds.includes(folderId));
        const sharedMemories = sharedLibraryMemoriesByLibraryId[folderId] ?? [];
        const deduped = new Map<string, Memory>();
        [...ownedMemories, ...sharedMemories].forEach(m => deduped.set(m.id, m));
        return Array.from(deduped.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }, [memories, sharedLibraryMemoriesByLibraryId]);

    const createCustomFolder = useCallback(async (folderName: string): Promise<{ success: boolean; message?: string }> => {
        if (!user?.id) {
            return { success: false, message: 'You need to be logged in to create folders.' };
        }

        const trimmedName = folderName.trim();
        if (!trimmedName) {
            return { success: false, message: 'Please enter a folder name.' };
        }

        const normalizedName = toFolderLookupKey(trimmedName);
        const existingCountryNames = memoriesRef.current
            .map(m => m.country)
            .filter(Boolean)
            .map(c => toFolderLookupKey(c as string));
        const existingCustomNames = customFoldersRef.current.map(f => toFolderLookupKey(f.name));

        if ([...existingCountryNames, ...existingCustomNames].includes(normalizedName)) {
            return { success: false, message: 'A folder with that name already exists.' };
        }

        const folderNameForDb = toDisplayFolderName(trimmedName);
        const { data: insertedLibrary, error: insertLibraryError } = await supabase
            .from('libraries')
            .insert([{ owner_id: user.id, name: folderNameForDb }])
            .select('id, name, owner_id, created_at')
            .single();

        if (insertLibraryError || !insertedLibrary) {
            return { success: false, message: insertLibraryError?.message || 'Could not create folder.' };
        }

        const { error: memberError } = await supabase.from('library_members').upsert(
            [{ library_id: insertedLibrary.id, user_id: user.id, role: 'owner' }],
            { onConflict: 'library_id,user_id' }
        );

        if (memberError) {
            return { success: false, message: memberError.message };
        }

        const nextFolder: CustomFolder = {
            id: insertedLibrary.id.toString(),
            name: insertedLibrary.name,
            created_at: insertedLibrary.created_at ?? new Date().toISOString(),
            owner_id: insertedLibrary.owner_id,
            role: 'owner',
            isShared: false,
        };

        setCustomFolders(prev => [...prev, nextFolder].sort((a, b) => a.name.localeCompare(b.name)));
        return { success: true };
    }, [user, memoriesRef, customFoldersRef, setCustomFolders]);

    const removeLibrary = useCallback(async (folderId: string): Promise<{ success: boolean; message?: string }> => {
        if (!user?.id) {
            return { success: false, message: 'You need to be logged in to remove a library.' };
        }

        const targetFolder = customFoldersRef.current.find(f => f.id === folderId);
        if (!targetFolder) {
            return { success: false, message: 'Library not found.' };
        }

        if (targetFolder.role === 'owner') {
            const { data: otherMembers, error: membersError } = await supabase
                .from('library_members')
                .select('user_id')
                .eq('library_id', folderId)
                .neq('user_id', user.id);

            if (membersError) {
                return { success: false, message: membersError.message };
            }

            if (otherMembers && otherMembers.length > 0) {
                const nextOwnerId = otherMembers[0].user_id;

                const { error: updateLibraryError } = await supabase
                    .from('libraries')
                    .update({ owner_id: nextOwnerId })
                    .eq('id', folderId);

                if (updateLibraryError) {
                    return { success: false, message: updateLibraryError.message };
                }

                const { error: promoteError } = await supabase
                    .from('library_members')
                    .update({ role: 'owner' })
                    .eq('library_id', folderId)
                    .eq('user_id', nextOwnerId);

                if (promoteError) {
                    return { success: false, message: promoteError.message };
                }

                const { error: removeOwnerError } = await supabase
                    .from('library_members')
                    .delete()
                    .eq('library_id', folderId)
                    .eq('user_id', user.id);

                if (removeOwnerError) {
                    return { success: false, message: removeOwnerError.message };
                }
            } else {
                const { error: deleteLibraryError } = await supabase
                    .from('libraries')
                    .delete()
                    .eq('id', folderId);

                if (deleteLibraryError) {
                    return { success: false, message: deleteLibraryError.message };
                }
            }
        } else {
            const { error: removeMembershipError } = await supabase
                .from('library_members')
                .delete()
                .eq('library_id', folderId)
                .eq('user_id', user.id);

            if (removeMembershipError) {
                return { success: false, message: removeMembershipError.message };
            }
        }

        setCustomFolders(prev => prev.filter(f => f.id !== folderId));
        setSharedLibraryMemoriesByLibraryId(prev => {
            const next = { ...prev };
            delete next[folderId];
            return next;
        });
        setMemories(prev => prev.map(m => ({
            ...m,
            customFolderIds: m.customFolderIds.filter(id => id !== folderId),
        })));

        const storedMeta = await loadMemoryMeta(user.id);
        const nextMeta = Object.entries(storedMeta).reduce<Record<string, typeof storedMeta[string]>>(
            (acc, [memoryId, meta]) => {
                acc[memoryId] = { ...meta, customFolderIds: meta.customFolderIds.filter(id => id !== folderId) };
                return acc;
            }, {}
        );
        await saveMemoryMeta(user.id, nextMeta);

        return { success: true };
    }, [user, customFoldersRef, setMemories, setCustomFolders, setSharedLibraryMemoriesByLibraryId]);

    const toggleMemoryInCustomFolder = useCallback(async (memoryId: string, folderId: string): Promise<void> => {
        if (!user?.id) return;

        const targetMemory = memoriesRef.current.find(m => m.id === memoryId);
        const targetFolder = customFoldersRef.current.find(f => f.id === folderId);
        if (!targetMemory || !targetFolder) return;

        if (targetFolder.role !== 'owner') {
            Alert.alert('Read only', 'You do not have permission to edit this shared library.');
            return;
        }

        const existingIds = targetMemory.customFolderIds;
        const alreadyInFolder = existingIds.includes(folderId);
        const nextFolderIds = alreadyInFolder
            ? existingIds.filter(id => id !== folderId)
            : [...existingIds, folderId];

        const { error: folderUpdateError } = alreadyInFolder
            ? await supabase.from('library_memos').delete().eq('library_id', folderId).eq('memo_id', memoryId)
            : await supabase.from('library_memos').insert([{ library_id: folderId, memo_id: memoryId, added_by: user.id }]);

        if (folderUpdateError) {
            Alert.alert('Update failed', folderUpdateError.message);
            return;
        }

        setMemories(prev => prev.map(m =>
            m.id !== memoryId ? m : { ...m, customFolderIds: nextFolderIds }
        ));

        const storedMeta = await loadMemoryMeta(user.id);
        await saveMemoryMeta(user.id, {
            ...storedMeta,
            [memoryId]: {
                country: targetMemory.country,
                title: targetMemory.title,
                description: targetMemory.description,
                customFolderIds: nextFolderIds,
                excludeFromCountryFolder: targetMemory.excludeFromCountryFolder ?? false,
            },
        });
    }, [user, memoriesRef, customFoldersRef, setMemories]);

    return { getLibraryMemories, createCustomFolder, removeLibrary, toggleMemoryInCustomFolder };
}
