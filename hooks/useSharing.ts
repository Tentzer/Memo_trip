import { supabase } from '@/lib/supabase';
import { InviteActionResult, PendingInvite, PendingLibraryInvite, PendingMemoInvite } from '@/types/invites';
import { CustomFolder, Memory } from '@/types/memory';
import { User } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

interface Params {
    user: User | null;
    customFoldersRef: React.MutableRefObject<CustomFolder[]>;
    getLibraryMemories: (folderId: string) => Memory[];
    reloadMemories: () => Promise<void>;
}

export function useSharing({ user, customFoldersRef, getLibraryMemories, reloadMemories }: Params) {
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
                ? supabase.from('libraries').select('id, name').in('id', libraryIds)
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
        (librariesResult.data ?? []).forEach((library: any) => {
            libraryNameById.set(library.id.toString(), library.name);
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

    const handleShareSubmit = useCallback(async (user_email: string, selectedMemory: Memory | null): Promise<void> => {
        if (!user_email) {
            Alert.alert('Please enter a valid email address');
            return;
        }
        if (!selectedMemory) {
            Alert.alert('Error', 'No memory selected.');
            return;
        }

        const { data: receiver } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', user_email)
            .maybeSingle();

        if (!receiver) {
            Alert.alert('User does not exist in Memo Trip!');
            return;
        }

        const { data: { user: currentUser } } = await supabase.auth.getUser();

        const { error } = await supabase.from('pending_shares').insert([{
            sender_id: currentUser?.id,
            receiver_email: user_email,
            memory_id: selectedMemory.id,
            image_uri: selectedMemory.uri,
            latitude: selectedMemory.latitude,
            longitude: selectedMemory.longitude,
            status: 'pending',
            created_at: new Date().toISOString(),
        }]);

        if (error) {
            Alert.alert('Error', 'Could not share memory: ' + error.message);
        } else {
            Alert.alert('Success', 'Invitation sent! The memory will appear once they accept.');
        }
    }, []);

    const shareCustomFolder = useCallback(async (user_email: string, folderId: string): Promise<void> => {
        if (!user_email) {
            Alert.alert('Please enter a valid email address');
            return;
        }
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

        const { data: receiver } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', user_email)
            .maybeSingle();

        if (!receiver) {
            Alert.alert('User does not exist in Memo Trip!');
            return;
        }
        if (receiver.id === user.id) {
            Alert.alert('Invalid recipient', 'You already own this library.');
            return;
        }

        const { data: existingMembership } = await supabase
            .from('library_members')
            .select('user_id')
            .eq('library_id', folderId)
            .eq('user_id', receiver.id)
            .maybeSingle();

        if (existingMembership) {
            Alert.alert('Already shared', `${receiver.email} already has access to this library.`);
            return;
        }

        const { data: pendingInvite } = await supabase
            .from('library_invites')
            .select('id')
            .eq('library_id', folderId)
            .eq('receiver_email', user_email)
            .eq('status', 'pending')
            .maybeSingle();

        if (pendingInvite) {
            Alert.alert('Invite pending', 'An invitation has already been sent to this user.');
            return;
        }

        const sourceLibraryMemories = getLibraryMemories(folderId).filter(m => !m.isShared);
        if (sourceLibraryMemories.length === 0) {
            Alert.alert('Empty library', 'Add at least one photo before sharing this library.');
            return;
        }

        const { data: insertedInvite, error: inviteError } = await supabase
            .from('library_invites')
            .insert([{
                library_id: folderId,
                sender_id: user.id,
                receiver_email: user_email,
                status: 'pending',
                created_at: new Date().toISOString(),
            }])
            .select('id')
            .single();

        if (inviteError || !insertedInvite) {
            Alert.alert('Error', 'Could not share library: ' + inviteError?.message);
            return;
        }

        const snapshotRows = sourceLibraryMemories.map(m => ({
            sender_id: user.id,
            receiver_email: user_email,
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
            Alert.alert('Error', 'Could not prepare library share: ' + snapshotError.message);
            return;
        }

        Alert.alert('Success', 'Library invitation sent.');
    }, [user, customFoldersRef, getLibraryMemories]);

    const grantLibraryEditAccess = useCallback(async (user_email: string, folderId: string): Promise<void> => {
        const trimmed = user_email.trim();
        if (!trimmed) {
            Alert.alert('Email required', 'Enter an email address.');
            return;
        }
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

        const { data: receiver } = await supabase
            .from('profiles')
            .select('id, email')
            .eq('email', trimmed)
            .maybeSingle();

        if (!receiver) {
            Alert.alert('User not found', 'No Memo Trip account uses that email.');
            return;
        }
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

        const { data: invite, error: fetchError } = await supabase
            .from('pending_shares')
            .select('id, image_uri, latitude, longitude')
            .eq('id', inviteId)
            .maybeSingle();

        if (fetchError || !invite) {
            return { success: false, message: fetchError?.message || 'Invite not found.' };
        }

        const { error: insertError } = await supabase.from('memories').insert([{
            user_id: user.id,
            image_url: invite.image_uri,
            latitude: invite.latitude,
            longitude: invite.longitude,
        }]);

        if (insertError) {
            return { success: false, message: insertError.message };
        }

        await supabase.from('pending_shares').delete().eq('id', inviteId);
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
        acceptMemoInvite,
        declineMemoInvite,
        acceptLibraryInvite,
        declineLibraryInvite,
        checkForIncomingShares,
        grantLibraryEditAccess,
    };
}
