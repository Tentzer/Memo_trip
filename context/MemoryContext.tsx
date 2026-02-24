import React, {createContext, useContext, useEffect, useState} from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {supabase} from "@/lib/supabase";
import { useAuth } from './AuthContext';

export interface Memory {
    id: string;
    uri: string;
    latitude: number;
    longitude: number;
    created_at: string; // Colons here!
}

interface MemoryContextType {
    memories: Memory[];
    addMemory: () => Promise<void>;
    deleteMemory: (id: string) => void;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export function MemoryProvider({ children }: { children: React.ReactNode }) {

    const [memories , setMemories] = useState<Memory[]>([]);
    let cameraResult: ImagePicker.ImagePickerResult;
    const { user } = useAuth();

    useEffect(() => {
        if (user) {
            fetchMemories(user.id); // If user exists, go get their stuff
        } else {
            setMemories([]); // If user is null, the map must be empty
        }
    }, [user]);

    const fetchMemories = async (user_id: string) => {

        const { data, error } = await supabase
            .from('memories')
            .select('*')
            .eq('user_id', user_id); // 'eq' means 'equals'

        if (error) {
            console.error("Fetch Error:", error.message);
            return;
        }

        if (data) {
            const formattedMemories: Memory[] = data.map((item: any) => ({
                id: item.id.toString(),
                uri: item.image_url, // Here we swap image_url for uri
                latitude: item.latitude,
                longitude: item.longitude,
                created_at: new Date().toISOString(),
            }));

            setMemories(formattedMemories);
        }
    };

    const uploadPicture = async (photoUri: string, latitude: number, longitude: number, tempId: string) => {
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
            const { error: dbError } = await supabase
                .from('memories')
                .insert([{
                    image_url: publicUrl,
                    latitude,
                    longitude,
                    user_id: user?.id
                }]);

            if (dbError) throw dbError;

            setMemories(prev => prev.map(m =>
                m.id === tempId ? { ...m, uri: publicUrl } : m
            ));

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


            const tempId = Date.now().toString();
            const localMemory: Memory = {
                id: tempId,
                uri: photoUri,
                latitude: lat,
                longitude: lng,
                created_at: new Date().toISOString(),
            };

            setMemories(prev => [...prev, localMemory]);

            await uploadPicture(photoUri, lat, lng, tempId);
        }
    }

    return (
        <MemoryContext.Provider value={{ memories, addMemory, deleteMemory}}>
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