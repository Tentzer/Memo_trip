import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Memory } from '@/types/memory';
import { loadMemoryMeta, saveMemoryMeta } from '@/lib/memoryStorage';
import { getCountryNameFromCoords } from '@/lib/geocoding';
import { uploadPicture } from '@/lib/memoryApi';

interface Params {
    user: User | null;
    memoriesRef: React.MutableRefObject<Memory[]>;
    setMemories: React.Dispatch<React.SetStateAction<Memory[]>>;
}

export function useMemoryCRUD({ user, memoriesRef, setMemories }: Params) {

    const addMemory = useCallback(async (): Promise<void> => {
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

        if (!user?.id) return;
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
        description?: string
    ): Promise<void> => {
        if (!user?.id) return;

        const tempId = Date.now().toString();
        const trimmedDescription = description?.trim();
        const localMemory: Memory = {
            id: tempId,
            uri: photoUri,
            latitude: lat,
            longitude: lng,
            created_at: new Date().toISOString(),
            country,
            description: trimmedDescription || undefined,
            customFolderIds: [],
        };

        setMemories(prev => [...prev, localMemory]);

        const storedMeta = await loadMemoryMeta(user.id);
        await saveMemoryMeta(user.id, {
            ...storedMeta,
            [tempId]: {
                country,
                title: undefined,
                description: trimmedDescription || undefined,
                customFolderIds: [],
                excludeFromCountryFolder: false,
            },
        });

        const result = await uploadPicture(photoUri, lat, lng, tempId, country, user.id, {
            description: trimmedDescription,
        });
        if (result) {
            setMemories(prev => prev.map(m =>
                m.id === tempId ? { ...m, id: result.persistedId, uri: result.publicUrl } : m
            ));
        }
    }, [user, setMemories]);

    const deleteMemory = useCallback(async (memoryID: string): Promise<void> => {
        const memoryToDelete = memoriesRef.current.find(m => m.id === memoryID);
        if (!memoryToDelete) return;

        setMemories(prev => prev.filter(m => m.id !== memoryID));

        if (user?.id) {
            const storedMeta = await loadMemoryMeta(user.id);
            const nextMeta = { ...storedMeta };
            delete nextMeta[memoryID];
            await saveMemoryMeta(user.id, nextMeta);
        }

        const { error: dbError } = await supabase.from('memories').delete().eq('id', memoryID);
        if (dbError) {
            console.error('DB delete failed:', dbError.message);
        }

        const fileName = memoryToDelete.uri.split('/').pop();
        if (fileName) {
            const { error: storageError } = await supabase.storage.from('memories').remove([fileName]);
            if (storageError) {
                console.error('Storage cleanup failed:', storageError.message);
            }
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
