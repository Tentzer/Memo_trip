import LibraryModal from '@/components/LibraryModal';
import { useMemories } from '@/context/MemoryContext';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';

export default function LibrariesScreen() {
    const isFocused = useIsFocused();
    const {
        memories,
        sharedLibraryMemories,
        customFolders,
        createCustomFolder,
        removeLibrary,
        shareCustomFolder,
        grantLibraryEditAccess,
        addPlaceMemory,
        toggleMemoryInCustomFolder,
        updateCustomFolderCover,
    } = useMemories();

    return (
        <LibraryModal
            visible={isFocused}
            variant="countries"
            onClose={() => router.navigate('/onboarding/Home')}
            memories={memories}
            sharedLibraryMemories={sharedLibraryMemories}
            customFolders={customFolders}
            createCustomFolder={createCustomFolder}
            removeLibrary={removeLibrary}
            shareCustomFolder={shareCustomFolder}
            grantLibraryEditAccess={grantLibraryEditAccess}
            addPlaceMemory={addPlaceMemory}
            toggleMemoryInCustomFolder={toggleMemoryInCustomFolder}
            updateCustomFolderCover={updateCustomFolderCover}
            jumpToLocation={(lat, lng) => {
                router.navigate({
                    pathname: '/onboarding/Home',
                    params: { focusLat: String(lat), focusLng: String(lng) },
                });
            }}
            onShowFolderOnMap={(folderId, folderType, folderName) => {
                router.navigate({
                    pathname: '/onboarding/Home',
                    params: { folderId, folderType, folderName },
                });
            }}
        />
    );
}
