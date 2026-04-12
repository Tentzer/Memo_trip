import React, {createContext, useContext, useEffect, useState} from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {supabase} from "@/lib/supabase";
import { useAuth } from './AuthContext';
import {Alert} from "react-native";

export interface Memory {
    id: string;
    uri: string;
    latitude: number;
    longitude: number;
    created_at: string;
    owner_id?: string;
    isShared?: boolean;
    country?: string;
    title?: string;
    description?: string;
    customFolderIds: string[];
    excludeFromCountryFolder?: boolean;
}

export interface CustomFolder {
    id: string;
    name: string;
    created_at: string;
    owner_id: string;
    role: 'owner' | 'editor' | 'viewer';
    isShared: boolean;
}

interface MemoryMeta {
    country?: string;
    title?: string;
    description?: string;
    customFolderIds: string[];
    excludeFromCountryFolder?: boolean;
}

interface MemoryContextType {
    memories: Memory[];
    customFolders: CustomFolder[];
    addMemory: () => Promise<void>;
    deleteMemory: (id: string) => void;
    handleShareSubmit: (user_email: string, selectedMemory: Memory | null) => Promise<void>;
    shareCustomFolder: (user_email: string, folderId: string) => Promise<void>;
    removeLibrary: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    createCustomFolder: (folderName: string) => Promise<{ success: boolean; message?: string }>;
    toggleMemoryInCustomFolder: (memoryId: string, folderId: string) => Promise<void>;
    updateMemoryInfo: (memoryId: string, title: string, description: string) => Promise<void>;
    getLibraryMemories: (folderId: string) => Memory[];
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

const getCustomFoldersStorageKey = (userId: string) => `memoTrip:customFolders:${userId}`;
const getMemoryMetaStorageKey = (userId: string) => `memoTrip:memoryMeta:${userId}`;
const getLibrariesMigratedKey = (userId: string) => `memoTrip:librariesMigrated:${userId}`;

const toDisplayFolderName = (value: string) =>
    value
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());

const toFolderLookupKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

const getCountryNameFromCoords = async (latitude: number, longitude: number): Promise<string> => {
    try {
        const results = await Location.reverseGeocodeAsync({ latitude, longitude });
        const country = results[0]?.country?.trim();

        return country ? toDisplayFolderName(country) : 'Unknown Location';
    } catch (error) {
        console.error('Country lookup failed:', error);
        return 'Unknown Location';
    }
};

export function MemoryProvider({ children }: { children: React.ReactNode }) {

    const [memories , setMemories] = useState<Memory[]>([]);
    const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
    const [sharedLibraryMemoriesByLibraryId, setSharedLibraryMemoriesByLibraryId] = useState<Record<string, Memory[]>>({});
    let cameraResult: ImagePicker.ImagePickerResult;
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            checkForIncomingShares();
            fetchMemories(user.id);
        } else {
            setMemories([]); // If user is null, the map must be empty
            setCustomFolders([]);
            setSharedLibraryMemoriesByLibraryId({});
        }
    }, [user]);

    const loadMemoryMeta = async (userId: string): Promise<Record<string, MemoryMeta>> => {
        try {
            const storedValue = await AsyncStorage.getItem(getMemoryMetaStorageKey(userId));
            return storedValue ? JSON.parse(storedValue) : {};
        } catch (error) {
            console.error('Could not load memory metadata:', error);
            return {};
        }
    };

    const saveMemoryMeta = async (userId: string, nextMeta: Record<string, MemoryMeta>) => {
        try {
            await AsyncStorage.setItem(getMemoryMetaStorageKey(userId), JSON.stringify(nextMeta));
        } catch (error) {
            console.error('Could not save memory metadata:', error);
        }
    };

    const fetchLibraryState = async (userId: string) => {
        const { data: memberRows, error: membersError } = await supabase
            .from('library_members')
            .select('library_id, role')
            .eq('user_id', userId);

        if (membersError || !memberRows || memberRows.length === 0) {
            return {
                folders: [] as CustomFolder[],
                memoLibraryIdsMap: {} as Record<string, string[]>,
                libraryIds: [] as string[],
            };
        }

        const roleByLibraryId = memberRows.reduce<Record<string, CustomFolder['role']>>((accumulator, row: any) => {
            accumulator[row.library_id.toString()] = row.role as CustomFolder['role'];
            return accumulator;
        }, {});

        const libraryIds = Object.keys(roleByLibraryId);
        const { data: libraryRows, error: librariesError } = await supabase
            .from('libraries')
            .select('id, owner_id, name, created_at')
            .in('id', libraryIds);

        if (librariesError || !libraryRows) {
            console.error('Could not load libraries:', librariesError?.message);
            return {
                folders: [] as CustomFolder[],
                memoLibraryIdsMap: {} as Record<string, string[]>,
                libraryIds: [] as string[],
            };
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
            return {
                folders,
                memoLibraryIdsMap: {} as Record<string, string[]>,
                libraryIds,
            };
        }

        const memoLibraryIdsMap = libraryMemoRows.reduce<Record<string, string[]>>((accumulator, row: any) => {
            const memoId = row.memo_id.toString();
            const libraryId = row.library_id.toString();
            const existingIds = accumulator[memoId] ?? [];

            if (!existingIds.includes(libraryId)) {
                accumulator[memoId] = [...existingIds, libraryId];
            }

            return accumulator;
        }, {});

        return { folders, memoLibraryIdsMap, libraryIds };
    };

    const migrateLocalLibrariesToSupabase = async (userId: string, rawMemories: any[]) => {
        const hasMigrated = await AsyncStorage.getItem(getLibrariesMigratedKey(userId));
        if (hasMigrated) {
            return;
        }

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
                    .insert([{
                        owner_id: userId,
                        name: folder.name,
                        created_at: folder.created_at,
                    }])
                    .select('id')
                    .single();

                if (insertLibraryError || !insertedLibrary) {
                    console.error('Could not migrate local folder:', insertLibraryError?.message);
                    continue;
                }

                const newLibraryId = insertedLibrary.id.toString();
                folderIdMap.set(folder.id, newLibraryId);
                existingByName.set(normalizedName, newLibraryId);

                await supabase.from('library_members').upsert([{
                    library_id: newLibraryId,
                    user_id: userId,
                    role: 'owner',
                }], {
                    onConflict: 'library_id,user_id',
                });
            }

            const validMemoryIds = new Set(rawMemories.map((memory: any) => memory.id.toString()));
            const storedMeta = await loadMemoryMeta(userId);
            const libraryMemoRows: Array<{ library_id: string; memo_id: string; added_by: string }> = [];

            Object.entries(storedMeta).forEach(([memoryId, meta]) => {
                if (!validMemoryIds.has(memoryId)) {
                    return;
                }

                (meta.customFolderIds ?? []).forEach((localFolderId) => {
                    const remoteLibraryId = folderIdMap.get(localFolderId);
                    if (!remoteLibraryId) {
                        return;
                    }

                    libraryMemoRows.push({
                        library_id: remoteLibraryId,
                        memo_id: memoryId,
                        added_by: userId,
                    });
                });
            });

            if (libraryMemoRows.length > 0) {
                await supabase.from('library_memos').upsert(libraryMemoRows, {
                    onConflict: 'library_id,memo_id',
                });
            }

            await AsyncStorage.setItem(getLibrariesMigratedKey(userId), 'done');
        } catch (error) {
            console.error('Local library migration failed:', error);
        }
    };

    const buildFormattedMemories = async (
        rawMemories: any[],
        userId: string,
        memoLibraryIdsMap: Record<string, string[]>,
        storedMeta: Record<string, MemoryMeta>,
        nextMeta: Record<string, MemoryMeta>
    ): Promise<{ formattedMemories: Memory[]; didUpdateMeta: boolean }> => {
        let didUpdateMeta = false;

        const formattedMemories: Memory[] = await Promise.all(
            rawMemories.map(async (item: any) => {
                const memoryId = item.id.toString();
                const existingMeta = nextMeta[memoryId] ?? storedMeta[memoryId] ?? { customFolderIds: [] };
                let country = existingMeta.country;

                if (!country) {
                    country = await getCountryNameFromCoords(item.latitude, item.longitude);
                    nextMeta[memoryId] = {
                        country,
                        title: existingMeta.title,
                        description: existingMeta.description,
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
                    title: existingMeta.title,
                    description: existingMeta.description,
                    customFolderIds: memoLibraryIdsMap[memoryId] ?? [],
                    excludeFromCountryFolder: existingMeta.excludeFromCountryFolder ?? false,
                };
            })
        );

        return { formattedMemories, didUpdateMeta };
    };

    const fetchMemories = async (user_id: string) => {
        const { data, error } = await supabase
            .from('memories')
            .select('*')
            .eq('user_id', user_id); // 'eq' means 'equals'

        if (error) {
            console.error("Fetch Error:", error.message);
            return;
        }

        if (!data) {
            return;
        }

        await migrateLocalLibrariesToSupabase(user_id, data);

        const { folders, memoLibraryIdsMap } = await fetchLibraryState(user_id);
        setCustomFolders(folders);

        const storedMeta = await loadMemoryMeta(user_id);
        const nextMeta: Record<string, MemoryMeta> = { ...storedMeta };

        const { formattedMemories, didUpdateMeta } = await buildFormattedMemories(
            data,
            user_id,
            memoLibraryIdsMap,
            storedMeta,
            nextMeta
        );

        setMemories(formattedMemories);

        const ownedMemoryIds = new Set(data.map((item: any) => item.id.toString()));
        const sharedMemoIds = Object.keys(memoLibraryIdsMap).filter((memoId) => !ownedMemoryIds.has(memoId));

        if (sharedMemoIds.length === 0) {
            setSharedLibraryMemoriesByLibraryId({});
        } else {
            const { data: sharedMemoryRows, error: sharedMemoriesError } = await supabase
                .from('memories')
                .select('*')
                .in('id', sharedMemoIds);

            if (sharedMemoriesError || !sharedMemoryRows) {
                console.error('Could not load shared library memos:', sharedMemoriesError?.message);
                setSharedLibraryMemoriesByLibraryId({});
            } else {
                const { formattedMemories: formattedSharedMemories, didUpdateMeta: didUpdateSharedMeta } =
                    await buildFormattedMemories(
                        sharedMemoryRows,
                        user_id,
                        memoLibraryIdsMap,
                        storedMeta,
                        nextMeta
                    );

                const nextSharedMap = formattedSharedMemories.reduce<Record<string, Memory[]>>((accumulator, memory) => {
                    memory.customFolderIds.forEach((libraryId) => {
                        accumulator[libraryId] = [...(accumulator[libraryId] ?? []), memory];
                    });
                    return accumulator;
                }, {});

                Object.keys(nextSharedMap).forEach((libraryId) => {
                    nextSharedMap[libraryId] = nextSharedMap[libraryId].sort(
                        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    );
                });

                setSharedLibraryMemoriesByLibraryId(nextSharedMap);

                if (didUpdateSharedMeta) {
                    await saveMemoryMeta(user_id, nextMeta);
                }
            }
        }

        if (didUpdateMeta) {
            await saveMemoryMeta(user_id, nextMeta);
        }
    };

    const uploadPicture = async (
        photoUri: string,
        latitude: number,
        longitude: number,
        tempId: string,
        country: string
    ) => {
        try {
            // Use the same ID for the filename to keep things consistent
            const fileName = `${tempId}.jpg`;

            // Convert and Upload (ArrayBuffer is most stable for RN)
            const response = await fetch(photoUri);
            const blob = await response.blob();
            const arrayBuffer = await new Response(blob).arrayBuffer();

            const { error: storageError } = await supabase.storage
                .from('memories')
                .upload(fileName, arrayBuffer, { contentType: 'image/jpeg' });

            if (storageError) throw storageError;

            const { data: { publicUrl } } = supabase.storage.from('memories').getPublicUrl(fileName);
            const { data: { user } } = await supabase.auth.getUser();

            // Insert into Database
            const { data: insertedMemory, error: dbError } = await supabase
                .from('memories')
                .insert([{
                    image_url: publicUrl,
                    latitude,
                    longitude,
                    user_id: user?.id
                }])
                .select('id')
                .single();

            if (dbError) throw dbError;

            const persistedId = insertedMemory.id.toString();

            setMemories(prev => prev.map(m =>
                m.id === tempId
                    ? { ...m, id: persistedId, uri: publicUrl, country, customFolderIds: [] }
                    : m
            ));

            if (user?.id) {
                const storedMeta = await loadMemoryMeta(user.id);
                const nextMeta = { ...storedMeta };
                const tempMeta = nextMeta[tempId];

                delete nextMeta[tempId];
                nextMeta[persistedId] = {
                    country,
                    title: tempMeta?.title,
                    description: tempMeta?.description,
                    customFolderIds: tempMeta?.customFolderIds ?? [],
                    excludeFromCountryFolder: tempMeta?.excludeFromCountryFolder ?? false,
                };

                await saveMemoryMeta(user.id, nextMeta);
            }

            console.log("Background Sync Complete.");
        } catch (err) {
            console.error("Cloud sync failed:", err);
            // If it fails, you could mark the memory as "Offline" or "Failed" here
        }
    }

    const deleteMemory = async (memoryID : string): Promise<void> => {
        const memoryToDelete = memories.find(m => m.id === memoryID);

        if (!memoryToDelete) return;

        setMemories(prevMemories => prevMemories.filter(memory  => memory.id !== memoryID))

        if (user?.id) {
            const storedMeta = await loadMemoryMeta(user.id);
            const nextMeta = { ...storedMeta };
            delete nextMeta[memoryID];
            await saveMemoryMeta(user.id, nextMeta);
        }

        const {error: dbError} = await supabase.from('memories').delete().eq('image_url', memoryToDelete.uri );

        if (dbError) {
            console.error("Storage cleanup failed:", dbError.message);
        }

        const fileName = memoryToDelete.uri.split('/').pop();

        if (fileName) {
            // 2. Delete from Storage
            const {error: storageError} = await supabase
                .storage
                .from('memories')
                .remove([fileName]); // remove expects an array of filenames

            if (storageError) {
                console.error("Storage cleanup failed:", storageError.message);
            }

        }

    }

    const addMemory = async (): Promise<void> => {
        const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
        const locationPermission = await Location.requestForegroundPermissionsAsync();

        if (cameraPermission.status !== 'granted' || locationPermission.status !== 'granted') {
            alert("Permissions required to save memories!");
            return;
        }

        cameraResult = await ImagePicker.launchCameraAsync();

        if (!cameraResult.canceled) {
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
                    [tempId]: {
                        country,
                        title: undefined,
                        description: undefined,
                        customFolderIds: [],
                        excludeFromCountryFolder: false,
                    },
                });
            }

            await uploadPicture(photoUri, lat, lng, tempId, country);
        }
    }

    const createCustomFolder = async (folderName: string): Promise<{ success: boolean; message?: string }> => {
        if (!user?.id) {
            return { success: false, message: 'You need to be logged in to create folders.' };
        }

        const trimmedName = folderName.trim();
        if (!trimmedName) {
            return { success: false, message: 'Please enter a folder name.' };
        }

        const normalizedName = toFolderLookupKey(trimmedName);
        const existingCountryNames = memories
            .map(memory => memory.country)
            .filter(Boolean)
            .map(countryName => toFolderLookupKey(countryName as string));
        const existingCustomNames = customFolders.map(folder => toFolderLookupKey(folder.name));

        if ([...existingCountryNames, ...existingCustomNames].includes(normalizedName)) {
            return { success: false, message: 'A folder with that name already exists.' };
        }

        const folderNameForDb = toDisplayFolderName(trimmedName);
        const { data: insertedLibrary, error: insertLibraryError } = await supabase
            .from('libraries')
            .insert([{
                owner_id: user.id,
                name: folderNameForDb,
            }])
            .select('id, name, owner_id, created_at')
            .single();

        if (insertLibraryError || !insertedLibrary) {
            return { success: false, message: insertLibraryError?.message || 'Could not create folder.' };
        }

        const { error: memberError } = await supabase.from('library_members').upsert([{
            library_id: insertedLibrary.id,
            user_id: user.id,
            role: 'owner',
        }], {
            onConflict: 'library_id,user_id',
        });

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

        setCustomFolders((previousFolders) =>
            [...previousFolders, nextFolder].sort((a, b) => a.name.localeCompare(b.name))
        );

        return { success: true };
    };

    const removeLibrary = async (folderId: string): Promise<{ success: boolean; message?: string }> => {
        if (!user?.id) {
            return { success: false, message: 'You need to be logged in to remove a library.' };
        }

        const targetFolder = customFolders.find((folder) => folder.id === folderId);
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

                const { error: removeOwnerMembershipError } = await supabase
                    .from('library_members')
                    .delete()
                    .eq('library_id', folderId)
                    .eq('user_id', user.id);

                if (removeOwnerMembershipError) {
                    return { success: false, message: removeOwnerMembershipError.message };
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

        setCustomFolders((previousFolders) => previousFolders.filter((folder) => folder.id !== folderId));
        setSharedLibraryMemoriesByLibraryId((previousMap) => {
            const nextMap = { ...previousMap };
            delete nextMap[folderId];
            return nextMap;
        });
        setMemories((previousMemories) =>
            previousMemories.map((memory) => ({
                ...memory,
                customFolderIds: memory.customFolderIds.filter((id) => id !== folderId),
            }))
        );

        const storedMeta = await loadMemoryMeta(user.id);
        const nextMeta = Object.entries(storedMeta).reduce<Record<string, MemoryMeta>>((accumulator, [memoryId, meta]) => {
            accumulator[memoryId] = {
                ...meta,
                customFolderIds: (meta.customFolderIds ?? []).filter((id) => id !== folderId),
            };
            return accumulator;
        }, {});
        await saveMemoryMeta(user.id, nextMeta);

        return { success: true };
    };

    const toggleMemoryInCustomFolder = async (memoryId: string, folderId: string) => {
        if (!user?.id) return;

        const targetMemory = memories.find(memory => memory.id === memoryId);
        const targetFolder = customFolders.find(folder => folder.id === folderId);
        if (!targetMemory) return;
        if (!targetFolder) return;

        const canEditFolder = targetFolder.role === 'owner';
        if (!canEditFolder) {
            Alert.alert('Read only', 'You do not have permission to edit this shared library.');
            return;
        }

        const existingIds = targetMemory.customFolderIds ?? [];
        const alreadyInFolder = existingIds.includes(folderId);
        const nextFolderIds = alreadyInFolder
            ? existingIds.filter(id => id !== folderId)
            : [...existingIds, folderId];

        const { error: folderUpdateError } = alreadyInFolder
            ? await supabase
                .from('library_memos')
                .delete()
                .eq('library_id', folderId)
                .eq('memo_id', memoryId)
            : await supabase
                .from('library_memos')
                .insert([{
                    library_id: folderId,
                    memo_id: memoryId,
                    added_by: user.id,
                }]);

        if (folderUpdateError) {
            Alert.alert('Update failed', folderUpdateError.message);
            return;
        }

        setMemories(prevMemories =>
            prevMemories.map(memory => {
                if (memory.id !== memoryId) {
                    return memory;
                }

                return {
                    ...memory,
                    customFolderIds: nextFolderIds,
                };
            })
        );

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
    };

    const updateMemoryInfo = async (memoryId: string, title: string, description: string) => {
        if (!user?.id) return;

        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const targetMemory = memories.find(memory => memory.id === memoryId);

        if (!targetMemory) return;

        setMemories(prevMemories =>
            prevMemories.map(memory =>
                memory.id === memoryId
                    ? {
                        ...memory,
                        title: trimmedTitle || undefined,
                        description: trimmedDescription || undefined,
                    }
                    : memory
            )
        );

        const storedMeta = await loadMemoryMeta(user.id);
        await saveMemoryMeta(user.id, {
            ...storedMeta,
            [memoryId]: {
                country: targetMemory.country,
                title: trimmedTitle || undefined,
                description: trimmedDescription || undefined,
                customFolderIds: targetMemory.customFolderIds ?? [],
                excludeFromCountryFolder: targetMemory.excludeFromCountryFolder ?? false,
            },
        });
    };

    const handleShareSubmit = async (user_email: string, selectedMemory: Memory | null) => {
        if(!user_email){
            Alert.alert("Please enter a valid email address");
            return;
        }

        if (!selectedMemory) {
            Alert.alert("Error", "No memory selected.");
            return;
        }

        const { data: receiver } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', user_email)
            .maybeSingle();

        if(!receiver) {
            Alert.alert("User does not exist in Memo Trip!");
            return;
        }


        const { data: { user } } = await supabase.auth.getUser();
        const senderId = user?.id;



        const sharePayload = {
            sender_id: senderId,                // The UUID of the person logged in
            receiver_email: user_email,        // The email from your TextInput
            memory_id: selectedMemory.id,      // The ID of the actual memory
            image_uri: selectedMemory.uri, // The link to the photo (no download needed!)
            latitude: selectedMemory.latitude,
            longitude: selectedMemory.longitude,
            status: 'pending',
            created_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('pending_shares').insert([sharePayload]);


        if (error) {
            Alert.alert("Error", "Could not share memory: " + error.message);
            return;
        } else {
            Alert.alert("Success", "Invitation sent! The memory will appear once they accept.");
            return;
        }



    }

    const shareCustomFolder = async (user_email: string, folderId: string) => {
        if (!user_email) {
            Alert.alert('Please enter a valid email address');
            return;
        }

        if (!user?.id) {
            Alert.alert('Error', 'You need to be logged in to share a library.');
            return;
        }

        const targetFolder = customFolders.find((folder) => folder.id === folderId);
        if (!targetFolder) {
            Alert.alert('Error', 'Library not found.');
            return;
        }

        if (targetFolder.role !== 'owner') {
            Alert.alert('Not allowed', 'Only the library owner can send share invitations.');
            return;
        }

        const { data: receiver } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', user_email)
            .maybeSingle();

        if (!receiver) {
            Alert.alert('User does not exist in Memo Trip!');
            return;
        }

        if (receiver.id === user.id) {
            Alert.alert('Invalid recipient', 'You already own this library.');
            return;
        }

        const { data: existingMembership } = await supabase
            .from('library_members')
            .select('user_id')
            .eq('library_id', folderId)
            .eq('user_id', receiver.id)
            .maybeSingle();

        if (existingMembership) {
            Alert.alert('Already shared', `${receiver.email} already has access to this library.`);
            return;
        }

        const { data: pendingInvite } = await supabase
            .from('library_invites')
            .select('id')
            .eq('library_id', folderId)
            .eq('receiver_email', user_email)
            .eq('status', 'pending')
            .maybeSingle();

        if (pendingInvite) {
            Alert.alert('Invite pending', 'An invitation has already been sent to this user.');
            return;
        }

        const sourceLibraryMemories = getLibraryMemories(folderId).filter((memory) => !memory.isShared);
        if (sourceLibraryMemories.length === 0) {
            Alert.alert('Empty library', 'Add at least one photo before sharing this library.');
            return;
        }

        const { data: insertedInvite, error: inviteError } = await supabase.from('library_invites').insert([{
            library_id: folderId,
            sender_id: user.id,
            receiver_email: user_email,
            status: 'pending',
            created_at: new Date().toISOString(),
        }]).select('id').single();

        if (inviteError || !insertedInvite) {
            Alert.alert('Error', 'Could not share library: ' + inviteError?.message);
            return;
        }

        const snapshotRows = sourceLibraryMemories.map((memory) => ({
            sender_id: user.id,
            receiver_email: user_email,
            memory_id: memory.id,
            image_uri: memory.uri,
            latitude: memory.latitude,
            longitude: memory.longitude,
            status: `library_invite:${insertedInvite.id}`,
            created_at: new Date().toISOString(),
        }));

        const { error: snapshotError } = await supabase.from('pending_shares').insert(snapshotRows);

        if (snapshotError) {
            await supabase.from('library_invites').delete().eq('id', insertedInvite.id);
            Alert.alert('Error', 'Could not prepare library share: ' + snapshotError.message);
            return;
        }

        Alert.alert('Success', 'Library invitation sent.');
    };

    const checkForIncomingShares = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        const { data: shares, error: fetchError } = await supabase
            .from('pending_shares')
            .select('*')
            .eq('receiver_email', user.email)
            .eq('status', 'pending');

        if (!fetchError && shares && shares.length > 0) {
            const share = shares[0];

            Alert.alert(
                "New Memory Shared!",
                `A new memory has been shared with you. Would you like to add it to your map?`,
                [
                    {
                        text: "Decline",
                        style: "cancel",
                        onPress: async () => {
                            await supabase.from('pending_shares').delete().eq('id', share.id);
                        }
                    },
                    {
                        text: "Accept",
                        onPress: async () => {
                            const { error: insertError } = await supabase
                                .from('memories')
                                .insert([{
                                    user_id: user.id,
                                    image_url: share.image_uri,
                                    latitude: share.latitude,
                                    longitude: share.longitude,
                                }]);

                            if (!insertError) {
                                await supabase.from('pending_shares').delete().eq('id', share.id);
                                fetchMemories(user.id);

                                setTimeout(() => {
                                    Alert.alert("Success", "Memory added to your map!");
                                }, 500);
                            } else {
                                setTimeout(() => {
                                    Alert.alert("Error", "Could not accept memory: " + insertError.message);
                                }, 500);
                            }
                        }
                    }
                ]
            );
            return;
        }

        const { data: libraryInvites, error: libraryInviteError } = await supabase
            .from('library_invites')
            .select('id, library_id')
            .eq('receiver_email', user.email)
            .eq('status', 'pending');

        if (libraryInviteError || !libraryInvites || libraryInvites.length === 0) return;

        const libraryInvite = libraryInvites[0];
        const { data: library } = await supabase
            .from('libraries')
            .select('name')
            .eq('id', libraryInvite.library_id)
            .maybeSingle();

        Alert.alert(
            'New Library Shared!',
            `${library?.name ?? 'A library'} has been shared with you. Would you like to add it to your libraries?`,
            [
                {
                    text: 'Decline',
                    style: 'cancel',
                    onPress: async () => {
                        await supabase
                            .from('pending_shares')
                            .delete()
                            .eq('receiver_email', user.email)
                            .eq('status', `library_invite:${libraryInvite.id}`);

                        await supabase
                            .from('library_invites')
                            .update({
                                status: 'declined',
                                responded_at: new Date().toISOString(),
                            })
                            .eq('id', libraryInvite.id);
                    }
                },
                {
                    text: 'Accept',
                    onPress: async () => {
                        const baseLibraryName = (library?.name?.trim() || 'Shared Library');
                        let nextLibraryName = baseLibraryName;
                        let insertedLibrary: { id: string } | null = null;
                        let createLibraryError: any = null;

                        for (let attempt = 0; attempt < 5; attempt += 1) {
                            const candidateName = attempt === 0 ? nextLibraryName : `${baseLibraryName} (${attempt + 1})`;
                            const { data, error } = await supabase
                                .from('libraries')
                                .insert([{
                                    owner_id: user.id,
                                    name: candidateName,
                                }])
                                .select('id')
                                .single();

                            if (!error && data) {
                                insertedLibrary = data;
                                createLibraryError = null;
                                break;
                            }

                            createLibraryError = error;
                            nextLibraryName = candidateName;
                        }

                        if (!insertedLibrary || createLibraryError) {
                            Alert.alert('Error', 'Could not create your copy of this library: ' + (createLibraryError?.message ?? 'Unknown error'));
                            return;
                        }

                        const { error: ownerMembershipError } = await supabase.from('library_members').upsert([{
                            library_id: insertedLibrary.id,
                            user_id: user.id,
                            role: 'owner',
                        }], {
                            onConflict: 'library_id,user_id',
                        });

                        if (ownerMembershipError) {
                            await supabase.from('libraries').delete().eq('id', insertedLibrary.id);
                            Alert.alert('Error', 'Could not create library membership: ' + ownerMembershipError.message);
                            return;
                        }

                        const { data: snapshotRows, error: snapshotFetchError } = await supabase
                            .from('pending_shares')
                            .select('image_uri, latitude, longitude')
                            .eq('receiver_email', user.email)
                            .eq('status', `library_invite:${libraryInvite.id}`);

                        if (snapshotFetchError || !snapshotRows || snapshotRows.length === 0) {
                            await supabase.from('library_members').delete().eq('library_id', insertedLibrary.id).eq('user_id', user.id);
                            await supabase.from('libraries').delete().eq('id', insertedLibrary.id);
                            Alert.alert('Error', 'Could not copy shared photos. Please ask the sender to re-share the library.');
                            return;
                        }

                        const memoryRowsForRecipient = snapshotRows.map((row: any) => ({
                            user_id: user.id,
                            image_url: row.image_uri,
                            latitude: row.latitude,
                            longitude: row.longitude,
                        }));

                        const { data: copiedMemories, error: copiedMemoriesError } = await supabase
                            .from('memories')
                            .insert(memoryRowsForRecipient)
                            .select('id');

                        if (copiedMemoriesError || !copiedMemories || copiedMemories.length === 0) {
                            await supabase.from('library_members').delete().eq('library_id', insertedLibrary.id).eq('user_id', user.id);
                            await supabase.from('libraries').delete().eq('id', insertedLibrary.id);
                            Alert.alert('Error', 'Could not add shared photos to your account: ' + copiedMemoriesError?.message);
                            return;
                        }

                        const libraryMemoRows = copiedMemories.map((memory: any) => ({
                            library_id: insertedLibrary.id,
                            memo_id: memory.id,
                            added_by: user.id,
                        }));

                        const { error: libraryMemosError } = await supabase.from('library_memos').insert(libraryMemoRows);

                        if (libraryMemosError) {
                            await supabase.from('library_members').delete().eq('library_id', insertedLibrary.id).eq('user_id', user.id);
                            await supabase.from('libraries').delete().eq('id', insertedLibrary.id);
                            await supabase.from('memories').delete().eq('user_id', user.id).in('id', copiedMemories.map((memory: any) => memory.id));
                            Alert.alert('Error', 'Could not finish library copy: ' + libraryMemosError.message);
                            return;
                        }

                        const storedMeta = await loadMemoryMeta(user.id);
                        const copiedMetaEntries = copiedMemories.reduce<Record<string, MemoryMeta>>((accumulator, memory: any) => {
                            accumulator[memory.id.toString()] = {
                                country: undefined,
                                title: undefined,
                                description: undefined,
                                customFolderIds: [insertedLibrary.id.toString()],
                                excludeFromCountryFolder: true,
                            };
                            return accumulator;
                        }, {});

                        await saveMemoryMeta(user.id, {
                            ...storedMeta,
                            ...copiedMetaEntries,
                        });

                        await supabase
                            .from('pending_shares')
                            .delete()
                            .eq('receiver_email', user.email)
                            .eq('status', `library_invite:${libraryInvite.id}`);

                        await supabase
                            .from('library_invites')
                            .update({
                                status: 'accepted',
                                responded_at: new Date().toISOString(),
                            })
                            .eq('id', libraryInvite.id);

                        await fetchMemories(user.id);
                        Alert.alert('Success', 'Library copied to your account.');
                    }
                }
            ]
        );
    };

    const getLibraryMemories = (folderId: string) => {
        const ownedMemories = memories.filter((memory) => memory.customFolderIds.includes(folderId));
        const sharedMemories = sharedLibraryMemoriesByLibraryId[folderId] ?? [];
        const dedupedMemories = new Map<string, Memory>();

        [...ownedMemories, ...sharedMemories].forEach((memory) => {
            dedupedMemories.set(memory.id, memory);
        });

        return Array.from(dedupedMemories.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    };

    return (
        <MemoryContext.Provider
            value={{
                memories,
                customFolders,
                addMemory,
                deleteMemory,
                handleShareSubmit,
                shareCustomFolder,
                removeLibrary,
                createCustomFolder,
                toggleMemoryInCustomFolder,
                updateMemoryInfo,
                getLibraryMemories,
            }}
        >
            {children}
        </MemoryContext.Provider>
    );
}


export const useMemories = () => {
    const context = useContext(MemoryContext);
    if (!context) {
        throw new Error("useMemories must be used within a MemoryProvider");
    }
    return context;
};