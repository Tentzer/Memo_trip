import { getCountryNameFromCoords, normalizeLocationFolderName } from '@/lib/geocoding';
import { uploadPicture } from '@/lib/memoryApi';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { supabase } from '@/lib/supabase';
import { Memory } from '@/types/memory';
import { User } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback } from 'react';

interface Params {
    user: User | null;
    memoriesRef: React.MutableRefObject<Memory[]>;
    setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
}

interface AddPlaceMemoryOptions {
    customFolderIds?: string[];
}

export function useMemoryCRUD({ user, memoriesRef, setMemories }: Params) {

    const addMemory = useCallback(async (): Promise<void> => {

        if (!user?.id) return;
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        const locationPermission = await Location.requestForegroundPermissionsAsync();

        if (cameraPermission.status !== 'granted' || locationPermission.status !== 'granted') {
            alert('Permissions required to save memories!');
            return;
        }

        const cameraResult = await ImagePicker.launchCameraAsync();
        if (cameraResult.canceled) return;

        const currentLocation = await Location.getCurrentPositionAsync();
        const photoUri = cameraResult.assets[0].uri;
        const lat = currentLocation.coords.latitude;
        const lng = currentLocation.coords.longitude;
        const country = await getCountryNameFromCoords(lat, lng);
        const tempId = Date.now().toString();

        const localMemory: Memory = {
            id: tempId,
            uri: photoUri,
            latitude: lat,
            longitude: lng,
            created_at: new Date().toISOString(),
            country,
            customFolderIds: [],
        };

        setMemories(prev => [...prev, localMemory]);

        if (user?.id) {
            const storedMeta = await loadMemoryMeta(user.id);
            await saveMemoryMeta(user.id, {
                ...storedMeta,
                [tempId]: { country, title: undefined, description: undefined, customFolderIds: [], excludeFromCountryFolder: false },
            });
        }

        const result = await uploadPicture(photoUri, lat, lng, tempId, country, user.id);
        if (result) {
            setMemories(prev => prev.map(m =>
                m.id === tempId ? { ...m, id: result.persistedId, uri: result.publicUrl } : m
            ));
        }
    }, [user, setMemories]);

    const addPlaceMemory = useCallback(async (
        photoUri: string,
        lat: number,
        lng: number,
        country: string,
        description?: string,
        title?: string,
        options?: AddPlaceMemoryOptions
    ): Promise<void> => {
        if (!user?.id) return;

        const tempId = Date.now().toString();
        const trimmedDescription = description?.trim();
        const trimmedTitle = title?.trim();
        const displayCountry = normalizeLocationFolderName(country);
        const customFolderIds = options?.customFolderIds ?? [];
        const localMemory: Memory = {
            id: tempId,
            uri: photoUri,
            latitude: lat,
            longitude: lng,
            created_at: new Date().toISOString(),
            country: displayCountry,
            title: trimmedTitle || undefined,
            description: trimmedDescription || undefined,
            customFolderIds,
        };

        setMemories(prev => [...prev, localMemory]);

        const storedMeta = await loadMemoryMeta(user.id);
        await saveMemoryMeta(user.id, {
            ...storedMeta,
            [tempId]: {
                country: displayCountry,
                title: trimmedTitle || undefined,
                description: trimmedDescription || undefined,
                customFolderIds,
                excludeFromCountryFolder: false,
            },
        });

        const result = await uploadPicture(photoUri, lat, lng, tempId, displayCountry, user.id, {
            title: trimmedTitle,
            description: trimmedDescription,
        });
        if (result) {
            let persistedFolderIds = customFolderIds;
            let folderInsertErrorMessage: string | null = null;

            if (customFolderIds.length > 0) {
                const { error: folderInsertError } = await supabase
                    .from('library_memos')
                    .insert(customFolderIds.map(folderId => ({
                        library_id: folderId,
                        memo_id: result.persistedId,
                        added_by: user.id,
                    })));

                if (folderInsertError) {
                    persistedFolderIds = [];
                    folderInsertErrorMessage = folderInsertError.message;
                    const latestMeta = await loadMemoryMeta(user.id);
                    await saveMemoryMeta(user.id, {
                        ...latestMeta,
                        [result.persistedId]: {
                            ...(latestMeta[result.persistedId] ?? {
                                country: displayCountry,
                                title: trimmedTitle || undefined,
                                description: trimmedDescription || undefined,
                                excludeFromCountryFolder: false,
                            }),
                            customFolderIds: [],
                        },
                    });
                }
            }

            setMemories(prev => prev.map(m =>
                m.id === tempId
                    ? { ...m, id: result.persistedId, uri: result.publicUrl, customFolderIds: persistedFolderIds }
                    : m
            ));

            if (folderInsertErrorMessage) {
                throw new Error(folderInsertErrorMessage);
            }
        }
    }, [user, setMemories]);

    const deleteMemory = useCallback(async (memoryID: string): Promise<void> => {
        if (!user?.id) return;
        const memoryToDelete = memoriesRef.current.find(m => m.id === memoryID);
        if (!memoryToDelete || memoryToDelete.deletedAt) return;

        const archivedAt = new Date().toISOString();

        setMemories(prev => prev.map(memory =>
            memory.id === memoryID
                ? { ...memory, deletedAt: archivedAt }
                : memory
        ));

        // Hard delete is intentionally reserved for a separate purge flow because shared libraries
        // still reference the canonical memo row and storage object.
        const { error: dbError } = await supabase
            .from('memories')
            .update({ deleted_at: archivedAt })
            .eq('id', memoryID)
            .eq('user_id', user.id);
        if (dbError) {
            console.error('Memo archive failed:', dbError.message);
        }
    }, [user, memoriesRef, setMemories]);

    const updateMemoryInfo = useCallback(async (memoryId: string, title: string, description: string): Promise<void> => {
        if (!user?.id) return;

        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const targetMemory = memoriesRef.current.find(m => m.id === memoryId);
        if (!targetMemory || targetMemory.isShared) return;

        setMemories(prev => prev.map(m =>
            m.id === memoryId
                ? { ...m, title: trimmedTitle || undefined, description: trimmedDescription || undefined }
                : m
        ));

        const storedMeta = await loadMemoryMeta(user.id);
        await saveMemoryMeta(user.id, {
            ...storedMeta,
            [memoryId]: {
                country: targetMemory.country,
                title: trimmedTitle || undefined,
                description: trimmedDescription || undefined,
                customFolderIds: targetMemory.customFolderIds,
                excludeFromCountryFolder: targetMemory.excludeFromCountryFolder ?? false,
            },
        });

        const { error: updateError } = await supabase
            .from('memories')
            .update({
                title: trimmedTitle || null,
                description: trimmedDescription || null,
            })
            .eq('id', memoryId)
            .eq('user_id', user.id);
        if (updateError) {
            console.error('Memory title/description sync failed:', updateError.message);
        }
    }, [user, memoriesRef, setMemories]);

    return { addMemory, addPlaceMemory, deleteMemory, updateMemoryInfo };
}
