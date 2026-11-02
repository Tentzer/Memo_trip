import InvitesModal from '@/components/InvitesModal';
import MarketPlaceModal from '@/components/MarketPlaceModal';
import MemoActionsSheet from '@/components/MemoActionsSheet';
import MemoInfoModal from '@/components/MemoInfoModal';
import PlaceDescriptionModal from '@/components/PlaceDescriptionModal';
import SettingsSheet, { type SettingsSheetRef } from '@/components/SettingsSheet';
import ShareMemoryModal from '@/components/ShareMemoryModal';
import type { Memory } from '@/context/MemoryContext';
import { alertRequireSignIn } from '@/lib/requireSignInAlert';
import type { CustomFolder } from '@/types/memory';
import { useRouter } from 'expo-router';
import React from 'react';

type HomeOverlayModalsProps = {
    userId?: string;
    isSignedIn: boolean;
    actionSheetMemory: Memory | null;
    selectedMemoryForActions: Memory | null;
    onCloseActions: () => void;
    onOpenInfoFromActions: () => void;
    onStartWalkingRoute: () => void;
    onOpenDrivingRoute: () => void;
    onShareFromActions: () => void;
    onDeleteFromActions: () => void;
    isInfoModalVisible: boolean;
    selectedMemoryForInfo: Memory | null;
    onCloseInfo: () => void;
    onSaveInfo: (title: string, description: string) => void;
    isShareMemoryVisible: boolean;
    onCloseShare: () => void;
    shareRecipient: string;
    setShareRecipient: (value: string) => void;
    memoryToShare: Memory | null;
    onSubmitShare: (recipientInput: string, memory: Memory | null) => Promise<void>;
    isNoPhotoDescriptionVisible: boolean;
    isAddingPlace: boolean;
    missingPhotoDescription: string;
    onChangeMissingPhotoDescription: (value: string) => void;
    onCloseNoPhotoDescription: () => void;
    onSkipNoPhotoDescription: () => void;
    onSaveNoPhotoDescription: () => void;
    settingsSheetRef: React.RefObject<SettingsSheetRef | null>;
    isDarkMode: boolean;
    setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
    showMemories: boolean;
    onShowMemoriesChange: (enabled: boolean) => void;
    onOpenInfo: () => void;
    invitesVisible: boolean;
    onCloseInvites: () => void;
    onOpenInvites: () => void;
    marketplaceVisible: boolean;
    onOpenMarketplace: () => void;
    onCloseMarketplace: () => void;
    customFolders: CustomFolder[];
    memories: Memory[];
    reloadMemories: () => Promise<void>;
};

export default function HomeOverlayModals({
    userId,
    isSignedIn,
    actionSheetMemory,
    selectedMemoryForActions,
    onCloseActions,
    onOpenInfoFromActions,
    onStartWalkingRoute,
    onOpenDrivingRoute,
    onShareFromActions,
    onDeleteFromActions,
    isInfoModalVisible,
    selectedMemoryForInfo,
    onCloseInfo,
    onSaveInfo,
    isShareMemoryVisible,
    onCloseShare,
    shareRecipient,
    setShareRecipient,
    memoryToShare,
    onSubmitShare,
    isNoPhotoDescriptionVisible,
    isAddingPlace,
    missingPhotoDescription,
    onChangeMissingPhotoDescription,
    onCloseNoPhotoDescription,
    onSkipNoPhotoDescription,
    onSaveNoPhotoDescription,
    settingsSheetRef,
    isDarkMode,
    setIsDarkMode,
    showMemories,
    onShowMemoriesChange,
    onOpenInfo,
    invitesVisible,
    onCloseInvites,
    onOpenInvites,
    marketplaceVisible,
    onOpenMarketplace,
    onCloseMarketplace,
    customFolders,
    memories,
    reloadMemories,
}: HomeOverlayModalsProps) {
    const router = useRouter();

    return (
        <>
            {actionSheetMemory ? (
                <MemoActionsSheet
                    memory={selectedMemoryForActions ?? actionSheetMemory}
                    onClose={onCloseActions}
                    onOpenInfo={onOpenInfoFromActions}
                    onStartWalkingRoute={onStartWalkingRoute}
                    onOpenDrivingRoute={onOpenDrivingRoute}
                    onShare={onShareFromActions}
                    onDelete={onDeleteFromActions}
                />
            ) : null}

            <MemoInfoModal
                visible={isInfoModalVisible}
                memory={selectedMemoryForInfo}
                readOnly={selectedMemoryForInfo?.isShared === true}
                onClose={onCloseInfo}
                onSave={onSaveInfo}
            />

            <ShareMemoryModal
                visible={isShareMemoryVisible}
                onClose={onCloseShare}
                shareRecipient={shareRecipient}
                setShareRecipient={setShareRecipient}
                memoryToShare={memoryToShare}
                onSubmit={onSubmitShare}
            />

            <PlaceDescriptionModal
                visible={isNoPhotoDescriptionVisible}
                isSaving={isAddingPlace}
                description={missingPhotoDescription}
                onChangeDescription={onChangeMissingPhotoDescription}
                onClose={onCloseNoPhotoDescription}
                onSkip={onSkipNoPhotoDescription}
                onSaveWithDescription={onSaveNoPhotoDescription}
            />

            <SettingsSheet
                ref={settingsSheetRef}
                isDarkMode={isDarkMode}
                setIsDarkMode={setIsDarkMode}
                showMemories={showMemories}
                onShowMemoriesChange={onShowMemoriesChange}
                showLoginRow={!isSignedIn}
                onOpenLogin={() => router.push('/Login')}
                onOpenMarketplace={onOpenMarketplace}
                onOpenInvites={() => {
                    if (!isSignedIn) {
                        alertRequireSignIn('Sign in to see and manage your invitations.');
                        return;
                    }
                    onOpenInvites();
                }}
                onOpenInfo={onOpenInfo}
                onOpenAccount={() => {
                    if (!isSignedIn) {
                        alertRequireSignIn('Sign in to open your account settings.');
                        return;
                    }
                    router.push('/account');
                }}
                onOpenPlan={() => router.push('/onboarding/plan')}
            />

            <InvitesModal visible={invitesVisible} onClose={onCloseInvites} />
            <MarketPlaceModal
                visible={marketplaceVisible}
                onClose={onCloseMarketplace}
                userId={userId}
                customFolders={customFolders}
                memories={memories}
                reloadMemories={reloadMemories}
            />
        </>
    );
}
