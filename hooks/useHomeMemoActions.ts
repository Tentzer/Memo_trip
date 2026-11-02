import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import type { Memory } from '@/types/memory';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

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
    const pendingShareRef = useRef(false);

    const selectedMemoryForInfo = useMemo(() => {
        if (!selectedMemoryForInfoId) return null;
        return memories.find((memory) => memory.id === selectedMemoryForInfoId)
            ?? sharedLibraryMemories.find((memory) => memory.id === selectedMemoryForInfoId)
            ?? null;
    }, [selectedMemoryForInfoId, memories, sharedLibraryMemories]);

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

    const handleWalkToMemo = useCallback(async () => {
        if (!selectedMemoryForInfo) return;
        const target = selectedMemoryForInfo;
        closeMemoInfo();
        setShowSearchBar(false);
        await returnToStartingPoint({ forceRefresh: true });
        const ok = await getPlaceRoute(target.latitude, target.longitude);
        if (ok) {
            setShowRoute(true);
        } else {
            setShowSearchBar(true);
        }
    }, [closeMemoInfo, getPlaceRoute, returnToStartingPoint, selectedMemoryForInfo, setShowRoute, setShowSearchBar]);

    const handleDriveToMemo = useCallback(() => {
        if (!selectedMemoryForInfo) return;
        const target = selectedMemoryForInfo;
        closeMemoInfo();
        void openDrivingInWaze(target.latitude, target.longitude);
    }, [closeMemoInfo, openDrivingInWaze, selectedMemoryForInfo]);

    const handleShareMemo = useCallback(() => {
        if (!selectedMemoryForInfo || selectedMemoryForInfo.isShared) return;
        if (!user) {
            alertRequireSignIn('Sign in to share this memo.');
            return;
        }
        const target = selectedMemoryForInfo;
        setMemoryToShare(target);
        setShareRecipient('');
        pendingShareRef.current = true;
        closeMemoInfo();
        if (Platform.OS !== 'ios') {
            pendingShareRef.current = false;
            setIsShareMemoryVisible(true);
        }
    }, [
        closeMemoInfo,
        selectedMemoryForInfo,
        setIsShareMemoryVisible,
        setMemoryToShare,
        setShareRecipient,
        user,
    ]);

    const handleDeleteMemo = useCallback(() => {
        if (!selectedMemoryForInfo || selectedMemoryForInfo.isShared) return;
        const target = selectedMemoryForInfo;
        closeMemoInfo();
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
            ],
        );
    }, [closeMemoInfo, deleteMemory, selectedMemoryForInfo]);

    const handleInfoModalDismissed = useCallback(() => {
        if (!pendingShareRef.current) return;
        pendingShareRef.current = false;
        setIsShareMemoryVisible(true);
    }, [setIsShareMemoryVisible]);

    return {
        isInfoModalVisible,
        selectedMemoryForInfo,
        openMemoInfo,
        closeMemoInfo,
        handleSaveMemoInfo,
        handleWalkToMemo,
        handleDriveToMemo,
        handleShareMemo,
        handleDeleteMemo,
        handleInfoModalDismissed,
    };
}
