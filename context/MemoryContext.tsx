import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { Memory, CustomFolder } from '@/types/memory';
import { loadUserMemories } from '@/lib/memoryApi';
import { useMemoryCRUD } from '@/hooks/useMemoryCRUD';
import { useLibraries } from '@/hooks/useLibraries';
import { useSharing } from '@/hooks/useSharing';

export type { Memory, CustomFolder } from '@/types/memory';

interface MemoryContextType {
    memories: Memory[];
    sharedLibraryMemories: Memory[];
    customFolders: CustomFolder[];
    addMemory: () => Promise<void>;
    addPlaceMemory: (
        photoUri: string,
        lat: number,
        lng: number,
        country: string,
        description?: string
    ) => Promise<void>;
    deleteMemory: (id: string) => void;
    updateMemoryInfo: (memoryId: string, title: string, description: string) => Promise<void>;
    createCustomFolder: (folderName: string) => Promise<{ success: boolean; message?: string }>;
    removeLibrary: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    toggleMemoryInCustomFolder: (memoryId: string, folderId: string) => Promise<void>;
    getLibraryMemories: (folderId: string) => Memory[];
    handleShareSubmit: (user_email: string, selectedMemory: Memory | null) => Promise<void>;
    shareCustomFolder: (user_email: string, folderId: string) => Promise<void>;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export function MemoryProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    const [memories, setMemories] = useState<Memory[]>([]);
    const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
    const [sharedLibraryMemoriesByLibraryId, setSharedLibraryMemoriesByLibraryId] = useState<Record<string, Memory[]>>({});

    const memoriesRef = useRef<Memory[]>([]);
    const customFoldersRef = useRef<CustomFolder[]>([]);

    useEffect(() => { memoriesRef.current = memories; }, [memories]);
    useEffect(() => { customFoldersRef.current = customFolders; }, [customFolders]);

    const reloadMemories = useCallback(async () => {
        if (!user?.id) return;
        const result = await loadUserMemories(user.id);
        setMemories(result.memories);
        setCustomFolders(result.customFolders);
        setSharedLibraryMemoriesByLibraryId(result.sharedMap);
    }, [user]);

    useEffect(() => {
        if (user) {
            reloadMemories();
        } else {
            setMemories([]);
            setCustomFolders([]);
            setSharedLibraryMemoriesByLibraryId({});
        }
    }, [user]);

    const { addMemory, addPlaceMemory, deleteMemory, updateMemoryInfo } = useMemoryCRUD({
        user,
        memoriesRef,
        setMemories,
    });

    const { getLibraryMemories, createCustomFolder, removeLibrary, toggleMemoryInCustomFolder } = useLibraries({
        user,
        memories,
        customFolders,
        sharedLibraryMemoriesByLibraryId,
        memoriesRef,
        customFoldersRef,
        setMemories,
        setCustomFolders,
        setSharedLibraryMemoriesByLibraryId,
    });

    const sharedLibraryMemories = useMemo<Memory[]>(() => {
        const seen = new Set<string>();
        return Object.values(sharedLibraryMemoriesByLibraryId).flat().filter(m => {
            if (seen.has(m.id)) return false;
            seen.add(m.id);
            return true;
        });
    }, [sharedLibraryMemoriesByLibraryId]);

    const { handleShareSubmit, shareCustomFolder, checkForIncomingShares } = useSharing({
        user,
        customFoldersRef,
        getLibraryMemories,
        reloadMemories,
    });

    useEffect(() => {
        if (user) checkForIncomingShares();
    }, [user]);

    const contextValue = useMemo<MemoryContextType>(() => ({
        memories,
        sharedLibraryMemories,
        customFolders,
        addMemory,
        addPlaceMemory,
        deleteMemory,
        updateMemoryInfo,
        createCustomFolder,
        removeLibrary,
        toggleMemoryInCustomFolder,
        getLibraryMemories,
        handleShareSubmit,
        shareCustomFolder,
    }), [
        memories, sharedLibraryMemories, customFolders,
        addMemory, addPlaceMemory, deleteMemory, updateMemoryInfo,
        createCustomFolder, removeLibrary, toggleMemoryInCustomFolder, getLibraryMemories,
        handleShareSubmit, shareCustomFolder,
    ]);

    return (
        <MemoryContext.Provider value={contextValue}>
            {children}
        </MemoryContext.Provider>
    );
}

export const useMemories = () => {
    const context = useContext(MemoryContext);
    if (!context) {
        throw new Error('useMemories must be used within a MemoryProvider');
    }
    return context;
};
