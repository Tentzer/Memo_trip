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
    /** Set when the invite is for a shared country folder rather than a custom library. */
    countryName?: string | null;
    previewImageUri?: string;
    itemCount: number;
}

export type PendingInvite = PendingMemoInvite | PendingLibraryInvite;

export interface InviteActionResult {
    success: boolean;
    message?: string;
}
