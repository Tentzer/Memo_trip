export interface PendingMemoInvite {
    id: string;
    type: 'memo';
    senderId: string | null;
    senderEmail?: string;
    createdAt: string;
    memoryId: string;
    imageUri: string;
    latitude: number;
    longitude: number;
}

export interface PendingLibraryInvite {
    id: string;
    type: 'library';
    senderId: string | null;
    senderEmail?: string;
    createdAt: string;
    libraryId: string;
    libraryName: string;
    previewImageUri?: string;
    itemCount: number;
}

export type PendingInvite = PendingMemoInvite | PendingLibraryInvite;

export interface InviteActionResult {
    success: boolean;
    message?: string;
}
