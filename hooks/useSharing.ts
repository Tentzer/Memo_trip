import { getCountryFolderMemories } from '@/lib/countryFolder';
import { RecipientProfile, resolveRecipientProfile } from '@/lib/resolveRecipientProfile';
import { supabase } from '@/lib/supabase';
import { InviteActionResult, PendingInvite, PendingLibraryInvite, PendingMemoInvite } from '@/types/invites';
import { CustomFolder, Memory } from '@/types/memory';
import { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

interface Params {
    user: User | null;
    memoriesRef: React.MutableRefObject<Memory[]>;
    customFoldersRef: React.MutableRefObject<CustomFolder[]>;
    getLibraryMemories: (folderId: string) => Memory[];
    reloadMemories: () => Promise<void>;
}

type ShareStepResult = { ok: true } | { ok: false; message: string };

/** Resolves a username/email input to a recipient, alerting when it cannot be used. */
async function resolveShareRecipient(recipientInput: string): Promise<RecipientProfile | null> {
    const trimmed = recipientInput.trim();
    if (!trimmed) {
        Alert.alert('Username required', 'Enter your friend Memo Trip username (or their email).');
        return null;
    }

    const receiver = await resolveRecipientProfile(trimmed);
    if (!receiver) {
        Alert.alert(
            'User not found',
            trimmed.includes('@')
                ? 'No Memo Trip account uses that email.'
                : 'No Memo Trip user has that username.',
        );
        return null;
    }

    return receiver;
}

async function getExistingLibraryAccess(
    libraryId: string,
    receiver: RecipientProfile,
): Promise<'member' | 'invited' | null> {
    const { data: membership } = await supabase
        .from('library_members')
        .select('user_id')
        .eq('library_id', libraryId)
        .eq('user_id', receiver.id)
        .maybeSingle();

    if (membership) return 'member';

    const { data: pendingInvite } = await supabase
        .from('library_invites')
        .select('id')
        .eq('library_id', libraryId)
        .eq('receiver_email', receiver.email)
        .eq('status', 'pending')
        .maybeSingle();

    return pendingInvite ? 'invited' : null;
}

/** Creates the invite plus the preview rows the recipient sees before accepting. */
async function sendLibraryInvite(
    libraryId: string,
    senderId: string,
    receiver: RecipientProfile,
    folderMemories: Memory[],
): Promise<ShareStepResult> {
    const { data: insertedInvite, error: inviteError } = await supabase
        .from('library_invites')
        .insert([{
            library_id: libraryId,
            sender_id: senderId,
            receiver_email: receiver.email,
            status: 'pending',
            created_at: new Date().toISOString(),
        }])
        .select('id')
        .single();

    if (inviteError || !insertedInvite) {
        return { ok: false, message: inviteError?.message ?? 'Could not create the invitation.' };
    }

    const snapshotRows = folderMemories.map(m => ({
        sender_id: senderId,
        receiver_email: receiver.email,
        memory_id: m.id,
        image_uri: m.uri,
        latitude: m.latitude,
        longitude: m.longitude,
        status: `library_invite:${insertedInvite.id}`,
        created_at: new Date().toISOString(),
    }));

    const { error: snapshotError } = await supabase.from('pending_shares').insert(snapshotRows);
    if (snapshotError) {
        await supabase.from('library_invites').delete().eq('id', insertedInvite.id);
        return { ok: false, message: snapshotError.message };
    }

    return { ok: true };
}

/**
 * Country folders exist only as a client-side grouping, so sharing one mirrors it into a managed
 * library. A DB trigger keeps later memos in sync; this backfills the memos saved before the share.
 */
async function ensureCountryShareLibrary(
    ownerId: string,
    countryName: string,
    folderMemories: Memory[],
): Promise<{ ok: true; libraryId: string } | { ok: false; message: string }> {
    const { data: existing, error: existingError } = await supabase
        .from('libraries')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('country_share_of', countryName)
        .maybeSingle();

    if (existingError) {
        return { ok: false, message: existingError.message };
    }

    let libraryId = existing?.id ? existing.id.toString() : null;

    if (!libraryId) {
        const { data: inserted, error: insertError } = await supabase
            .from('libraries')
            .insert([{ owner_id: ownerId, name: countryName, country_share_of: countryName }])
            .select('id')
            .single();

        if (insertError || !inserted) {
            return { ok: false, message: insertError?.message ?? 'Could not prepare the folder.' };
        }

        libraryId = inserted.id.toString();

        const { error: memberError } = await supabase.from('library_members').upsert(
            [{ library_id: libraryId, user_id: ownerId, role: 'owner' }],
            { onConflict: 'library_id,user_id' }
        );

        if (memberError) {
            return { ok: false, message: memberError.message };
        }
    }

    const { error: memoError } = await supabase.from('library_memos').upsert(
        folderMemories.map(memory => ({
            library_id: libraryId,
            memo_id: memory.id,
            added_by: ownerId,
        })),
        { onConflict: 'library_id,memo_id', ignoreDuplicates: true }
    );

    if (memoError) {
        return { ok: false, message: memoError.message };
    }

    return { ok: true, libraryId };
}

export function useSharing({ user, memoriesRef, customFoldersRef, getLibraryMemories, reloadMemories }: Params) {
    const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
    const [invitesLoading, setInvitesLoading] = useState(false);

    const refreshPendingInvites = useCallback(async (): Promise<void> => {
        if (!user?.email) {
            setPendingInvites([]);
            return;
        }

        setInvitesLoading(true);

        const [{ data: memoRows, error: memoError }, { data: libraryRows, error: libraryError }] = await Promise.all([
            supabase
                .from('pending_shares')
                .select('id, sender_id, memory_id, image_uri, latitude, longitude, created_at')
                .eq('receiver_email', user.email)
                .eq('status', 'pending')
                .order('created_at', { ascending: false }),
            supabase
                .from('library_invites')
                .select('id, library_id, sender_id, created_at')
                .eq('receiver_email', user.email)
                .eq('status', 'pending')
                .order('created_at', { ascending: false }),
        ]);

        if (memoError || libraryError) {
            console.error('Failed to load invites:', memoError?.message || libraryError?.message);
            setPendingInvites([]);
            setInvitesLoading(false);
            return;
        }

        const memoInvitesRaw = memoRows ?? [];
        const libraryInvitesRaw = libraryRows ?? [];
        const senderIds = Array.from(new Set(
            [...memoInvitesRaw, ...libraryInvitesRaw]
                .map(row => row.sender_id)
                .filter(Boolean)
        ));
        const libraryIds = Array.from(new Set(libraryInvitesRaw.map(row => row.library_id)));
        const libraryInviteStatuses = libraryInvitesRaw.map(row => `library_invite:${row.id}`);

        const [profilesResult, librariesResult, librarySnapshotsResult] = await Promise.all([
            senderIds.length > 0
                ? supabase.from('profiles').select('id, email').in('id', senderIds)
                : Promise.resolve({ data: [], error: null }),
            libraryIds.length > 0
                ? supabase.from('libraries').select('id, name, country_share_of').in('id', libraryIds)
                : Promise.resolve({ data: [], error: null }),
            libraryInviteStatuses.length > 0
                ? supabase
                    .from('pending_shares')
                    .select('status, image_uri')
                    .eq('receiver_email', user.email)
                    .in('status', libraryInviteStatuses)
                : Promise.resolve({ data: [], error: null }),
        ]);

        if (profilesResult.error || librariesResult.error || librarySnapshotsResult.error) {
            console.error(
                'Failed to enrich invites:',
                profilesResult.error?.message || librariesResult.error?.message || librarySnapshotsResult.error?.message
            );
            setPendingInvites([]);
            setInvitesLoading(false);
            return;
        }

        const senderEmailById = new Map<string, string>();
        (profilesResult.data ?? []).forEach((profile: any) => {
            senderEmailById.set(profile.id, profile.email);
        });

        const libraryNameById = new Map<string, string>();
        const libraryCountryById = new Map<string, string>();
        (librariesResult.data ?? []).forEach((library: any) => {
            libraryNameById.set(library.id.toString(), library.name);
            if (typeof library.country_share_of === 'string') {
                libraryCountryById.set(library.id.toString(), library.country_share_of);
            }
        });

        const libraryPreviewByInviteId = new Map<string, { imageUri?: string; itemCount: number }>();
        (librarySnapshotsResult.data ?? []).forEach((row: any) => {
            const inviteId = String(row.status).replace('library_invite:', '');
            const existing = libraryPreviewByInviteId.get(inviteId) ?? { itemCount: 0 };
            libraryPreviewByInviteId.set(inviteId, {
                imageUri: existing.imageUri ?? row.image_uri ?? undefined,
                itemCount: existing.itemCount + 1,
            });
        });

        const memoInvites: PendingMemoInvite[] = memoInvitesRaw.map((row: any) => ({
            id: row.id.toString(),
            type: 'memo',
            senderId: row.sender_id ?? null,
            senderEmail: row.sender_id ? senderEmailById.get(row.sender_id) : undefined,
            createdAt: row.created_at ?? new Date().toISOString(),
            memoryId: row.memory_id.toString(),
            imageUri: row.image_uri,
            latitude: row.latitude,
            longitude: row.longitude,
        }));

        const libraryInvites: PendingLibraryInvite[] = libraryInvitesRaw.map((row: any) => {
            const preview = libraryPreviewByInviteId.get(row.id.toString());
            return {
                id: row.id.toString(),
                type: 'library',
                senderId: row.sender_id ?? null,
                senderEmail: row.sender_id ? senderEmailById.get(row.sender_id) : undefined,
                createdAt: row.created_at ?? new Date().toISOString(),
                libraryId: row.library_id.toString(),
                libraryName: libraryNameById.get(row.library_id.toString()) ?? 'Shared library',
                countryName: libraryCountryById.get(row.library_id.toString()) ?? null,
                previewImageUri: preview?.imageUri,
                itemCount: preview?.itemCount ?? 0,
            };
        });

        setPendingInvites(
            [...memoInvites, ...libraryInvites].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
        );
        setInvitesLoading(false);
    }, [user?.email]);

    const handleShareSubmit = useCallback(async (recipientInput: string, selectedMemory: Memory | null): Promise<void> => {
        const trimmed = recipientInput.trim();
        if (!trimmed) {
            Alert.alert('Username required', 'Enter your friend Memo Trip username (or their email).');
            return;
        }
        if (!selectedMemory) {
            Alert.alert('Error', 'No memory selected.');
            return;
        }

        const receiver = await resolveRecipientProfile(trimmed);

        if (!receiver) {
            Alert.alert(
                'User not found',
                trimmed.includes('@')
                    ? 'No Memo Trip account uses that email.'
                    : 'No Memo Trip user has that username.',
            );
            return;
        }

        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (receiver.id === currentUser?.id) {
            Alert.alert('Invalid recipient', 'Choose someone else to share with.');
            return;
        }

        // Senders can see their own outgoing rows after the RLS policy migration.
        const { data: existingPending } = await supabase
            .from('pending_shares')
            .select('id')
            .eq('memory_id', selectedMemory.id)
            .eq('sender_id', currentUser?.id)
            .eq('receiver_email', receiver.email)
            .eq('status', 'pending')
            .maybeSingle();

        if (existingPending) {
            Alert.alert('Already sent', 'You already sent this memo to that person — they haven\'t accepted it yet.');
            return;
        }

        const { error } = await supabase.from('pending_shares').insert([{
            sender_id: currentUser?.id,
            receiver_email: receiver.email,
            memory_id: selectedMemory.id,
            image_uri: selectedMemory.uri,
            latitude: selectedMemory.latitude,
            longitude: selectedMemory.longitude,
            status: 'pending',
            created_at: new Date().toISOString(),
        }]);

        if (error) {
            // Unique-constraint violation = already pending (DB-level safety net).
            if (error.code === '23505') {
                Alert.alert('Already sent', 'You already sent this memo to that person — they haven\'t accepted it yet.');
            } else {
                Alert.alert('Error', 'Could not share memory: ' + error.message);
            }
        } else {
            Alert.alert('Success', 'Invitation sent! The memory will appear once they accept.');
        }
    }, []);

    const shareCustomFolder = useCallback(async (recipientInput: string, folderId: string): Promise<void> => {
        if (!user?.id) {
            Alert.alert('Error', 'You need to be logged in to share a library.');
            return;
        }

        const targetFolder = customFoldersRef.current.find(f => f.id === folderId);
        if (!targetFolder) {
            Alert.alert('Error', 'Library not found.');
            return;
        }
        if (targetFolder.role !== 'owner') {
            Alert.alert('Not allowed', 'Only the library owner can send share invitations.');
            return;
        }

        const receiver = await resolveShareRecipient(recipientInput);
        if (!receiver) return;
        if (receiver.id === user.id) {
            Alert.alert('Invalid recipient', 'You already own this library.');
            return;
        }

        const access = await getExistingLibraryAccess(folderId, receiver);
        if (access === 'member') {
            Alert.alert('Already shared', `${receiver.email} already has access to this library.`);
            return;
        }
        if (access === 'invited') {
            Alert.alert('Invite pending', 'An invitation has already been sent to this user.');
            return;
        }

        const sourceLibraryMemories = getLibraryMemories(folderId).filter(m => !m.isShared);
        if (sourceLibraryMemories.length === 0) {
            Alert.alert('Empty library', 'Add at least one photo before sharing this library.');
            return;
        }

        const invite = await sendLibraryInvite(folderId, user.id, receiver, sourceLibraryMemories);
        if (!invite.ok) {
            Alert.alert('Error', 'Could not share library: ' + invite.message);
            return;
        }

        Alert.alert('Success', 'Library invitation sent.');
    }, [user, customFoldersRef, getLibraryMemories]);

    const shareCountryFolder = useCallback(async (recipientInput: string, countryName: string): Promise<void> => {
        if (!user?.id) {
            Alert.alert('Error', 'You need to be logged in to share a country folder.');
            return;
        }

        const folderMemories = getCountryFolderMemories(memoriesRef.current, countryName)
            .filter(m => !m.isShared);
        if (folderMemories.length === 0) {
            Alert.alert('Empty folder', 'Save at least one memo in this country before sharing it.');
            return;
        }

        const receiver = await resolveShareRecipient(recipientInput);
        if (!receiver) return;
        if (receiver.id === user.id) {
            Alert.alert('Invalid recipient', 'Choose someone else to share with.');
            return;
        }

        const mirrorLibrary = await ensureCountryShareLibrary(user.id, countryName, folderMemories);
        if (!mirrorLibrary.ok) {
            Alert.alert('Error', 'Could not prepare this country folder: ' + mirrorLibrary.message);
            return;
        }

        const access = await getExistingLibraryAccess(mirrorLibrary.libraryId, receiver);
        if (access === 'member') {
            Alert.alert('Already shared', `${receiver.email} already has access to ${countryName}.`);
            return;
        }
        if (access === 'invited') {
            Alert.alert('Invite pending', 'An invitation has already been sent to this user.');
            return;
        }

        const invite = await sendLibraryInvite(
            mirrorLibrary.libraryId,
            user.id,
            receiver,
            folderMemories,
        );
        if (!invite.ok) {
            Alert.alert('Error', 'Could not share country folder: ' + invite.message);
            return;
        }

        await reloadMemories();
        Alert.alert(
            'Success',
            `${countryName} invitation sent. New memos you save there are shared automatically.`
        );
    }, [user, memoriesRef, reloadMemories]);

    const grantLibraryEditAccess = useCallback(async (recipientInput: string, folderId: string): Promise<void> => {
        if (!user?.id) {
            Alert.alert('Error', 'You need to be logged in.');
            return;
        }

        const targetFolder = customFoldersRef.current.find(f => f.id === folderId);
        if (!targetFolder) {
            Alert.alert('Error', 'Library not found.');
            return;
        }
        if (targetFolder.role !== 'owner') {
            Alert.alert('Not allowed', 'Only the library owner can grant edit access.');
            return;
        }

        const receiver = await resolveShareRecipient(recipientInput);
        if (!receiver) return;
        if (receiver.id === user.id) {
            Alert.alert('Invalid recipient', 'Choose someone else who already joined this library.');
            return;
        }

        const { data: membership } = await supabase
            .from('library_members')
            .select('role')
            .eq('library_id', folderId)
            .eq('user_id', receiver.id)
            .maybeSingle();

        if (!membership) {
            Alert.alert('Not in this library', 'That person is not in this library. Share the library with them first.');
            return;
        }
        if (membership.role === 'editor') {
            Alert.alert('Already set', 'They already have access to add memos to this library.');
            return;
        }
        if (membership.role !== 'viewer') {
            Alert.alert('Cannot grant', 'Edit access can only be granted to someone with viewer access.');
            return;
        }

        const { error } = await supabase
            .from('library_members')
            .update({ role: 'editor' })
            .eq('library_id', folderId)
            .eq('user_id', receiver.id)
            .eq('role', 'viewer');

        if (error) {
            Alert.alert('Could not grant access', error.message);
            return;
        }

        await reloadMemories();
        Alert.alert(
            'Access granted',
            'They can now add or remove their own photos in this library.'
        );
    }, [user, customFoldersRef, reloadMemories]);

    const acceptMemoInvite = useCallback(async (inviteId: string): Promise<InviteActionResult> => {
        if (!user?.id) {
            return { success: false, message: 'You need to be logged in to accept invites.' };
        }

        const { data, error } = await supabase.rpc('accept_pending_memo_share', {
            p_invite_id: inviteId,
        });

        if (error) {
            return { success: false, message: error.message };
        }

        const payload = data as { ok?: boolean; error?: string } | null;
        if (!payload?.ok) {
            const code = payload?.error ?? 'accept_failed';
            const friendly: Record<string, string> = {
                profile_missing: 'Could not load your profile.',
                invite_not_found: 'This invite is no longer valid.',
                invite_not_pending: 'This invite is no longer pending.',
                not_recipient: 'This invite was sent to a different account.',
                source_memo_missing: 'The shared memo no longer exists.',
                invite_sender_mismatch: 'This invite could not be verified.',
                source_memo_archived: 'The shared memo is no longer available.',
                accept_failed: 'Could not accept the invite.',
            };
            return { success: false, message: friendly[code] ?? code };
        }

        await reloadMemories();
        await refreshPendingInvites();
        return { success: true };
    }, [refreshPendingInvites, reloadMemories, user?.id]);

    const declineMemoInvite = useCallback(async (inviteId: string): Promise<InviteActionResult> => {
        const { error } = await supabase.from('pending_shares').delete().eq('id', inviteId);
        if (error) {
            return { success: false, message: error.message };
        }

        await refreshPendingInvites();
        return { success: true };
    }, [refreshPendingInvites]);

    const acceptLibraryInvite = useCallback(async (inviteId: string, libraryId: string): Promise<InviteActionResult> => {
        if (!user?.id || !user.email) {
            return { success: false, message: 'You need to be logged in to accept invites.' };
        }

        const { error: membershipError } = await supabase.from('library_members').upsert(
            [{ library_id: libraryId, user_id: user.id, role: 'viewer' }],
            { onConflict: 'library_id,user_id' }
        );

        if (membershipError) {
            return { success: false, message: membershipError.message };
        }

        await supabase.from('pending_shares').delete()
            .eq('receiver_email', user.email)
            .eq('status', `library_invite:${inviteId}`);
        await supabase.from('library_invites').delete()
            .eq('id', inviteId);

        await reloadMemories();
        await refreshPendingInvites();
        return { success: true };
    }, [refreshPendingInvites, reloadMemories, user?.email, user?.id]);

    const declineLibraryInvite = useCallback(async (inviteId: string): Promise<InviteActionResult> => {
        if (!user?.email) {
            return { success: false, message: 'You need to be logged in to decline invites.' };
        }

        await supabase.from('pending_shares').delete()
            .eq('receiver_email', user.email)
            .eq('status', `library_invite:${inviteId}`);
        const { error } = await supabase.from('library_invites').delete()
            .eq('id', inviteId);

        if (error) {
            return { success: false, message: error.message };
        }

        await refreshPendingInvites();
        return { success: true };
    }, [refreshPendingInvites, user?.email]);

    const checkForIncomingShares = useCallback(async (): Promise<void> => {
        await refreshPendingInvites();
    }, [refreshPendingInvites]);

    useEffect(() => {
        if (!user?.email) return;

        const incomingSharesChannel = supabase
            .channel(`incoming-shares:${user.id}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'pending_shares' },
                (payload: any) => {
                    const record = payload.new ?? payload.old;
                    if (record?.receiver_email === user.email) {
                        void refreshPendingInvites();
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'library_invites' },
                (payload: any) => {
                    const record = payload.new ?? payload.old;
                    if (record?.receiver_email === user.email) {
                        void refreshPendingInvites();
                    }
                }
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(incomingSharesChannel);
        };
    }, [refreshPendingInvites, user?.email, user?.id]);

    useEffect(() => {
        void refreshPendingInvites();
    }, [refreshPendingInvites]);

    return {
        pendingInvites,
        invitesLoading,
        refreshPendingInvites,
        handleShareSubmit,
        shareCustomFolder,
        shareCountryFolder,
        acceptMemoInvite,
        declineMemoInvite,
        acceptLibraryInvite,
        declineLibraryInvite,
        checkForIncomingShares,
        grantLibraryEditAccess,
    };
}
