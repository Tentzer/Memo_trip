import { useLibraries } from '@/hooks/useLibraries';
import { useMemoryCRUD } from '@/hooks/useMemoryCRUD';
import { useSharing } from '@/hooks/useSharing';
import { loadUserMemories, type LoadedMemories } from '@/lib/memoryApi';
import { loadMemoriesSnapshot, saveMemoriesSnapshot } from '@/lib/memoriesSnapshot';
import { InviteActionResult, PendingInvite } from '@/types/invites';
import { CustomFolder, Memory } from '@/types/memory';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

export type { PendingInvite } from '@/types/invites';
export type { CustomFolder, Memory } from '@/types/memory';

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
        description?: string,
        title?: string,
        options?: { customFolderIds?: string[]; source?: 'video_import'; sourceUrl?: string }
    ) => Promise<void>;
    deleteMemory: (id: string) => void;
    updateMemoryInfo: (memoryId: string, title: string, description: string) => Promise<void>;
    createCustomFolder: (folderName: string) => Promise<{ success: boolean; message?: string }>;
    removeLibrary: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    toggleMemoryInCustomFolder: (memoryId: string, folderId: string) => Promise<void>;
    updateCustomFolderCover: (folderId: string) => Promise<{ success: boolean; message?: string }>;
    getLibraryMemories: (folderId: string) => Memory[];
    handleShareSubmit: (recipientInput: string, selectedMemory: Memory | null) => Promise<void>;
    shareCustomFolder: (recipientInput: string, folderId: string) => Promise<void>;
    grantLibraryEditAccess: (recipientInput: string, folderId: string) => Promise<void>;
    pendingInvites: PendingInvite[];
    invitesLoading: boolean;
    reloadMemories: () => Promise<void>;
    refreshPendingInvites: () => Promise<void>;
    acceptMemoInvite: (inviteId: string) => Promise<InviteActionResult>;
    declineMemoInvite: (inviteId: string) => Promise<InviteActionResult>;
    acceptLibraryInvite: (inviteId: string, libraryId: string) => Promise<InviteActionResult>;
    declineLibraryInvite: (inviteId: string) => Promise<InviteActionResult>;
}

const MemoryContext = createContext<MemoryContextType | undefined>(undefined);

export function MemoryProvider({ children, ready = true }: { children: React.ReactNode; ready?: boolean }) {
    const { user } = useAuth();

    const [memories, setMemories] = useState<Memory[]>([]);
    const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
    const [sharedLibraryMemoriesByLibraryId, setSharedLibraryMemoriesByLibraryId] = useState<Record<string, Memory[]>>({});

    const memoriesRef = useRef<Memory[]>([]);
    const customFoldersRef = useRef<CustomFolder[]>([]);
    const sharedLibraryMemoriesByLibraryIdRef = useRef<Record<string, Memory[]>>({});
    const activeUserIdRef = useRef<string | null>(null);

    useEffect(() => { activeUserIdRef.current = user?.id ?? null; }, [user?.id]);

    useEffect(() => { memoriesRef.current = memories; }, [memories]);
    useEffect(() => { customFoldersRef.current = customFolders; }, [customFolders]);
    useEffect(() => { sharedLibraryMemoriesByLibraryIdRef.current = sharedLibraryMemoriesByLibraryId; }, [sharedLibraryMemoriesByLibraryId]);

    const applySuccessfulLoad = useCallback(async (userId: string, data: LoadedMemories) => {
        if (activeUserIdRef.current !== userId) return;
        setMemories(data.memories);
        setCustomFolders(data.customFolders);
        setSharedLibraryMemoriesByLibraryId(data.sharedMap);
        if (activeUserIdRef.current !== userId) return;
        await saveMemoriesSnapshot(userId, data);
    }, []);

    const reloadMemories = useCallback(async () => {
        const userId = user?.id;
        if (!userId) return;
        const result = await loadUserMemories(userId);
        if (!result.ok) return;
        await applySuccessfulLoad(userId, {
            memories: result.memories,
            customFolders: result.customFolders,
            sharedMap: result.sharedMap,
        });
    }, [user?.id, applySuccessfulLoad]);

    useEffect(() => {
        if (user && ready) {
            const userId = user.id;
            let cancelled = false;

            void (async () => {
                const hydrated = await loadMemoriesSnapshot(userId);
                if (cancelled) return;
                if (activeUserIdRef.current !== userId) return;
                if (hydrated) {
                    setMemories(hydrated.memories);
                    setCustomFolders(hydrated.customFolders);
                    setSharedLibraryMemoriesByLibraryId(hydrated.sharedMap);
                }

                const result = await loadUserMemories(userId);
                if (cancelled) return;
                if (activeUserIdRef.current !== userId) return;
                if (!result.ok) return;

                await applySuccessfulLoad(userId, {
                    memories: result.memories,
                    customFolders: result.customFolders,
                    sharedMap: result.sharedMap,
                });
            })();

            return () => {
                cancelled = true;
            };
        }

        if (!user) {
            setMemories([]);
            setCustomFolders([]);
            setSharedLibraryMemoriesByLibraryId({});
        }
    }, [user, ready, applySuccessfulLoad]);

    const { addMemory, addPlaceMemory, deleteMemory, updateMemoryInfo } = useMemoryCRUD({
        user,
        memoriesRef,
        setMemories,
    });

    const { getLibraryMemories, createCustomFolder, removeLibrary, toggleMemoryInCustomFolder, updateCustomFolderCover } = useLibraries({
        user,
        memoriesRef,
        customFoldersRef,
        sharedLibraryMemoriesByLibraryIdRef,
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

    const {
        pendingInvites,
        invitesLoading,
        refreshPendingInvites,
        handleShareSubmit,
        shareCustomFolder,
        grantLibraryEditAccess,
        acceptMemoInvite,
        declineMemoInvite,
        acceptLibraryInvite,
        declineLibraryInvite,
        checkForIncomingShares,
    } = useSharing({
        user,
        customFoldersRef,
        getLibraryMemories,
        reloadMemories,
    });

    useEffect(() => {
        if (user) checkForIncomingShares();
    }, [user, checkForIncomingShares]);

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
        updateCustomFolderCover,
        getLibraryMemories,
        handleShareSubmit,
        shareCustomFolder,
        grantLibraryEditAccess,
        pendingInvites,
        invitesLoading,
        reloadMemories,
        refreshPendingInvites,
        acceptMemoInvite,
        declineMemoInvite,
        acceptLibraryInvite,
        declineLibraryInvite,
    }), [
        memories, sharedLibraryMemories, customFolders,
        addMemory, addPlaceMemory, deleteMemory, updateMemoryInfo,
        createCustomFolder, removeLibrary, toggleMemoryInCustomFolder, updateCustomFolderCover, getLibraryMemories,
        handleShareSubmit, shareCustomFolder, grantLibraryEditAccess, pendingInvites, invitesLoading, reloadMemories, refreshPendingInvites,
        acceptMemoInvite, declineMemoInvite, acceptLibraryInvite, declineLibraryInvite,
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
