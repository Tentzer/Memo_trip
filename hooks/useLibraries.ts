import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { User } from '@supabase/supabase-js';
import { uploadLibraryCover } from '@/lib/memoryApi';
import { supabase } from '@/lib/supabase';
import { Memory, CustomFolder } from '@/types/memory';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { toDisplayFolderName, toFolderLookupKey } from '@/lib/geocoding';

interface Params {
    user: User | null;
    memoriesRef: React.MutableRefObject<Memory[]>;
    customFoldersRef: React.MutableRefObject<CustomFolder[]>;
    sharedLibraryMemoriesByLibraryIdRef: React.MutableRefObject<Record<string, Memory[]>>;
    setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
    setCustomFolders: React.Dispatch<React.SetStateAction<CustomFolder[]>>;
    setSharedLibraryMemoriesByLibraryId: React.Dispatch<React.SetStateAction<Record<string, Memory[]>>>;
}

export function useLibraries({
    user,
    memoriesRef,
    customFoldersRef,
    sharedLibraryMemoriesByLibraryIdRef,
    setMemories,
    setCustomFolders,
    setSharedLibraryMemoriesByLibraryId,
}: Params) {

    // Reads only from refs so the function identity never changes, preventing
    // cascade invalidation of every useMemo that depends on it.
    const getLibraryMemories = useCallback((folderId: string): Memory[] => {
        const ownedMemories = memoriesRef.current.filter(m => m.customFolderIds.includes(folderId));
        const sharedMemories = sharedLibraryMemoriesByLibraryIdRef.current[folderId] ?? [];
        const deduped = new Map<string, Memory>();
        [...ownedMemories, ...sharedMemories].forEach(m => deduped.set(m.id, m));
        return Array.from(deduped.values()).sort(
            (a, b) => (b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : 0)
        );
    }, []);

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
            .select('*')
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
            coverImageUrl: typeof insertedLibrary.cover_image_url === 'string' ? insertedLibrary.cover_image_url : null,
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

        const canCurate =
            targetFolder.role === 'owner'
            || targetFolder.role === 'editor';
        if (!canCurate) {
            Alert.alert('Read only', 'You do not have permission to edit this shared library.');
            return;
        }
        if (targetFolder.role === 'editor' && targetMemory.isShared) {
            Alert.alert(
                'Your photos only',
                'You can only add or remove your own photos in this shared library.'
            );
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

    const updateCustomFolderCover = useCallback(async (folderId: string): Promise<{ success: boolean; message?: string }> => {
        if (!user?.id) {
            return { success: false, message: 'You need to be logged in to update a library cover.' };
        }

        const targetFolder = customFoldersRef.current.find(folder => folder.id === folderId);
        if (!targetFolder) {
            return { success: false, message: 'Library not found.' };
        }

        if (targetFolder.role !== 'owner') {
            return { success: false, message: 'Only library owners can change the cover.' };
        }

        const mediaPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (mediaPermission.status !== 'granted') {
            return { success: false, message: 'Allow photo access to choose a library cover.' };
        }

        const pickerResult = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.9,
        });

        if (pickerResult.canceled) {
            return { success: false };
        }

        const asset = pickerResult.assets[0];
        if (!asset?.uri) {
            return { success: false, message: 'Could not read the selected image.' };
        }

        const uploadResult = await uploadLibraryCover(asset.uri, folderId);
        if (!uploadResult) {
            return { success: false, message: 'Could not upload the library cover.' };
        }

        const { error: updateError } = await supabase
            .from('libraries')
            .update({ cover_image_url: uploadResult.publicUrl })
            .eq('id', folderId);

        if (updateError) {
            if (updateError.message.includes('cover_image_url')) {
                return {
                    success: false,
                    message: 'Library cover support needs the latest Supabase migration. Apply the new libraries cover-image migration and try again.',
                };
            }
            return { success: false, message: updateError.message };
        }

        setCustomFolders(prev => prev.map(folder =>
            folder.id === folderId
                ? { ...folder, coverImageUrl: uploadResult.publicUrl }
                : folder
        ));

        return { success: true };
    }, [user, customFoldersRef, setCustomFolders]);

    return { getLibraryMemories, createCustomFolder, removeLibrary, toggleMemoryInCustomFolder, updateCustomFolderCover };
}
