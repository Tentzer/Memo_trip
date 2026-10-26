import type { Memory } from '@/types/memory';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';

type SignedInUser = { id: string } | null;

type UseHomeMemoActionsArgs = {
    memories: Memory[];
    sharedLibraryMemories: Memory[];
    user: SignedInUser;
    updateMemoryInfo: (memoryId: string, title: string, description: string) => Promise<void>;
    deleteMemory: (id: string) => void;
    returnToStartingPoint: (options?: { forceRefresh?: boolean }) => Promise<unknown>;
    getPlaceRoute: (lat?: number, lng?: number) => Promise<boolean>;
    openDrivingInWaze: (lat?: number, lng?: number) => Promise<unknown>;
    setShowSearchBar: (value: boolean) => void;
    setShowRoute: (value: boolean) => void;
    setMemoryToShare: (memory: Memory | null) => void;
    setShareRecipient: (value: string) => void;
    setIsShareMemoryVisible: (value: boolean) => void;
};

export function useHomeMemoActions({
    memories,
    sharedLibraryMemories,
    user,
    updateMemoryInfo,
    deleteMemory,
    returnToStartingPoint,
    getPlaceRoute,
    openDrivingInWaze,
    setShowSearchBar,
    setShowRoute,
    setMemoryToShare,
    setShareRecipient,
    setIsShareMemoryVisible,
}: UseHomeMemoActionsArgs) {
    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const [selectedMemoryForInfoId, setSelectedMemoryForInfoId] = useState<string | null>(null);
    const [actionSheetMemory, setActionSheetMemory] = useState<Memory | null>(null);

    const selectedMemoryForInfo = useMemo(() => {
        if (!selectedMemoryForInfoId) return null;
        return memories.find((memory) => memory.id === selectedMemoryForInfoId)
            ?? sharedLibraryMemories.find((memory) => memory.id === selectedMemoryForInfoId)
            ?? null;
    }, [selectedMemoryForInfoId, memories, sharedLibraryMemories]);

    const selectedMemoryForActions = useMemo(() => {
        if (!actionSheetMemory) return null;
        return (
            memories.find((memory) => memory.id === actionSheetMemory.id)
            ?? sharedLibraryMemories.find((memory) => memory.id === actionSheetMemory.id)
            ?? actionSheetMemory
        );
    }, [actionSheetMemory, memories, sharedLibraryMemories]);

    const openMemoActions = useCallback((memory: Memory) => {
        setActionSheetMemory(memory);
    }, []);

    const closeMemoActions = useCallback(() => {
        setActionSheetMemory(null);
    }, []);

    const openMemoInfo = useCallback((memory: Memory) => {
        setSelectedMemoryForInfoId(memory.id);
        setIsInfoModalVisible(true);
    }, []);

    const closeMemoInfo = useCallback(() => {
        setIsInfoModalVisible(false);
        setSelectedMemoryForInfoId(null);
    }, []);

    const handleSaveMemoInfo = useCallback(async (title: string, description: string) => {
        if (!selectedMemoryForInfoId || selectedMemoryForInfo?.isShared) return;
        await updateMemoryInfo(selectedMemoryForInfoId, title, description);
        closeMemoInfo();
    }, [selectedMemoryForInfoId, selectedMemoryForInfo?.isShared, updateMemoryInfo, closeMemoInfo]);

    const handleOpenInfoFromActions = useCallback(() => {
        if (!selectedMemoryForActions) return;
        const target = selectedMemoryForActions;
        closeMemoActions();
        openMemoInfo(target);
    }, [closeMemoActions, openMemoInfo, selectedMemoryForActions]);

    const handleWalkToMemo = useCallback(async () => {
        if (!selectedMemoryForActions) return;
        const target = selectedMemoryForActions;
        closeMemoActions();
        setShowSearchBar(false);
        await returnToStartingPoint({ forceRefresh: true });
        const ok = await getPlaceRoute(target.latitude, target.longitude);
        if (ok) {
            setShowRoute(true);
        } else {
            setShowSearchBar(true);
        }
    }, [closeMemoActions, getPlaceRoute, returnToStartingPoint, selectedMemoryForActions, setShowRoute, setShowSearchBar]);

    const handleDriveToMemo = useCallback(() => {
        if (!selectedMemoryForActions) return;
        const target = selectedMemoryForActions;
        closeMemoActions();
        void openDrivingInWaze(target.latitude, target.longitude);
    }, [closeMemoActions, openDrivingInWaze, selectedMemoryForActions]);

    const handleShareMemoFromActions = useCallback(() => {
        if (!selectedMemoryForActions || selectedMemoryForActions.isShared) return;
        if (!user) {
            alertRequireSignIn('Sign in to share this memo.');
            return;
        }
        setMemoryToShare(selectedMemoryForActions);
        setShareRecipient('');
        closeMemoActions();
        setIsShareMemoryVisible(true);
    }, [closeMemoActions, selectedMemoryForActions, setIsShareMemoryVisible, setMemoryToShare, setShareRecipient, user]);

    const handleDeleteMemoFromActions = useCallback(() => {
        if (!selectedMemoryForActions || selectedMemoryForActions.isShared) return;
        const target = selectedMemoryForActions;
        Alert.alert(
            'Archive memo',
            'This removes the memo from your main map and country folders, but keeps it available in any libraries that still include it.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => deleteMemory(target.id),
                },
            ]
        );
    }, [deleteMemory, selectedMemoryForActions]);

    return {
        isInfoModalVisible,
        actionSheetMemory,
        selectedMemoryForInfo,
        selectedMemoryForActions,
        openMemoActions,
        closeMemoActions,
        closeMemoInfo,
        handleSaveMemoInfo,
        handleOpenInfoFromActions,
        handleWalkToMemo,
        handleDriveToMemo,
        handleShareMemoFromActions,
        handleDeleteMemoFromActions,
    };
}
