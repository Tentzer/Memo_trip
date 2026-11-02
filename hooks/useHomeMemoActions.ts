import type { Memory } from '@/types/memory';
import { useCallback, useMemo, useState } from 'react';

type UseHomeMemoActionsArgs = {
    memories: Memory[];
    sharedLibraryMemories: Memory[];
    updateMemoryInfo: (memoryId: string, title: string, description: string) => Promise<void>;
    returnToStartingPoint: (options?: { forceRefresh?: boolean }) => Promise<unknown>;
    getPlaceRoute: (lat?: number, lng?: number) => Promise<boolean>;
    openDrivingInWaze: (lat?: number, lng?: number) => Promise<unknown>;
    setShowSearchBar: (value: boolean) => void;
    setShowRoute: (value: boolean) => void;
};

export function useHomeMemoActions({
    memories,
    sharedLibraryMemories,
    updateMemoryInfo,
    returnToStartingPoint,
    getPlaceRoute,
    openDrivingInWaze,
    setShowSearchBar,
    setShowRoute,
}: UseHomeMemoActionsArgs) {
    const [isInfoModalVisible, setIsInfoModalVisible] = useState(false);
    const [selectedMemoryForInfoId, setSelectedMemoryForInfoId] = useState<string | null>(null);

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

    return {
        isInfoModalVisible,
        selectedMemoryForInfo,
        openMemoInfo,
        closeMemoInfo,
        handleSaveMemoInfo,
        handleWalkToMemo,
        handleDriveToMemo,
    };
}
