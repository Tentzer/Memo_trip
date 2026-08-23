import { getCountryNameFromCoords, normalizeLocationFolderName } from '@/lib/geocoding';
import { deleteOwnedMemory } from '@/lib/deleteOwnedMemory';
import { uploadPicture } from '@/lib/memoryApi';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import { supabase } from '@/lib/supabase';
import { Memory } from '@/types/memory';
import { User } from '@supabase/supabase-js';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback } from 'react';
import { Alert } from 'react-native';

interface Params {
    user: User | null;
    memoriesRef: React.MutableRefObject<Memory[]>;
    setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
}

interface AddPlaceMemoryOptions {
    customFolderIds?: string[];
    source?: 'video_import';
    sourceUrl?: string;
}

export function useMemoryCRUD({ user, memoriesRef, setMemories }: Params) {

    const addMemory = useCallback(async (): Promise<void> => {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        const locationPermission = await Location.requestForegroundPermissionsAsync();

        if (cameraPermission.status !== 'granted' || locationPermission.status !== 'granted') {
            Alert.alert('Permissions needed', 'Allow camera and location to take a memo photo.');
            return;
        }

        const cameraResult = await ImagePicker.launchCameraAsync({
            quality: 0.85,
        });
        if (cameraResult.canceled) return;

        if (!user?.id) {
            alertRequireSignIn(
                'Create a free account to save photos to your map and sync them across devices.',
                'Nice shot!',
            );
            return;
        }

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
        const source = options?.source;
        const sourceUrl = options?.sourceUrl;
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
            source,
            sourceUrl,
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
                source,
                sourceUrl,
            },
        });

        const result = await uploadPicture(photoUri, lat, lng, tempId, displayCountry, user.id, {
            title: trimmedTitle,
            description: trimmedDescription,
            source,
            sourceUrl,
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

            const latestStoredMeta = await loadMemoryMeta(user.id);
            await saveMemoryMeta(user.id, {
                ...latestStoredMeta,
                [result.persistedId]: {
                    ...(latestStoredMeta[tempId] ?? latestStoredMeta[result.persistedId] ?? {
                        country: displayCountry,
                        title: trimmedTitle || undefined,
                        description: trimmedDescription || undefined,
                        customFolderIds: persistedFolderIds,
                        excludeFromCountryFolder: false,
                    }),
                    source,
                    sourceUrl,
                },
            });

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
        if (!memoryToDelete || memoryToDelete.deletedAt || memoryToDelete.isShared) return;

        const previousMemories = memoriesRef.current;
        setMemories(prev => prev.filter(memory => memory.id !== memoryID));

        const result = await deleteOwnedMemory(memoryID);
        if (!result.ok) {
            setMemories(previousMemories);
            Alert.alert('Delete failed', result.error);
            return;
        }

        const storedMeta = await loadMemoryMeta(user.id);
        if (storedMeta[memoryID]) {
            const nextMeta = { ...storedMeta };
            delete nextMeta[memoryID];
            await saveMemoryMeta(user.id, nextMeta);
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
                source: targetMemory.source,
                sourceUrl: targetMemory.sourceUrl,
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
