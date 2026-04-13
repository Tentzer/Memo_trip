import { useCallback } from 'react';
import { Alert } from 'react-native';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Memory, CustomFolder } from '@/types/memory';

interface Params {
    user: User | null;
    customFoldersRef: React.MutableRefObject<CustomFolder[]>;
    getLibraryMemories: (folderId: string) => Memory[];
    reloadMemories: () => Promise<void>;
}

export function useSharing({ user, customFoldersRef, getLibraryMemories, reloadMemories }: Params) {

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

    const checkForIncomingShares = useCallback(async (): Promise<void> => {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser?.email) return;

        const { data: shares, error: fetchError } = await supabase
            .from('pending_shares')
            .select('*')
            .eq('receiver_email', currentUser.email)
            .eq('status', 'pending');

        if (!fetchError && shares && shares.length > 0) {
            const share = shares[0];
            const remaining = shares.length - 1;
            const subtitle = remaining > 0
                ? `A memory has been shared with you (${remaining} more pending). Add it to your map?`
                : 'A memory has been shared with you. Add it to your map?';

            Alert.alert('New Memory Shared!', subtitle, [
                {
                    text: 'Decline',
                    style: 'cancel',
                    onPress: async () => {
                        await supabase.from('pending_shares').delete().eq('id', share.id);
                        if (remaining > 0) checkForIncomingShares();
                    },
                },
                {
                    text: 'Accept',
                    onPress: async () => {
                        const { error: insertError } = await supabase.from('memories').insert([{
                            user_id: currentUser.id,
                            image_url: share.image_uri,
                            latitude: share.latitude,
                            longitude: share.longitude,
                        }]);

                        if (!insertError) {
                            await supabase.from('pending_shares').delete().eq('id', share.id);
                            await reloadMemories();
                        } else {
                            Alert.alert('Error', 'Could not accept memory: ' + insertError.message);
                        }

                        if (remaining > 0) checkForIncomingShares();
                    },
                },
            ]);
            return;
        }

        const { data: libraryInvites, error: libraryInviteError } = await supabase
            .from('library_invites')
            .select('id, library_id')
            .eq('receiver_email', currentUser.email)
            .eq('status', 'pending');

        if (libraryInviteError || !libraryInvites || libraryInvites.length === 0) return;

        const libraryInvite = libraryInvites[0];
        const remainingInvites = libraryInvites.length - 1;

        const { data: library } = await supabase
            .from('libraries')
            .select('name')
            .eq('id', libraryInvite.library_id)
            .maybeSingle();

        Alert.alert(
            'New Library Shared!',
            `${library?.name ?? 'A library'} has been shared with you. Would you like to add it to your libraries?`,
            [
                {
                    text: 'Decline',
                    style: 'cancel',
                    onPress: async () => {
                        await supabase.from('pending_shares').delete()
                            .eq('receiver_email', currentUser.email)
                            .eq('status', `library_invite:${libraryInvite.id}`);
                        await supabase.from('library_invites').delete()
                            .eq('id', libraryInvite.id);

                        if (remainingInvites > 0) checkForIncomingShares();
                    },
                },
                {
                    text: 'Accept',
                    onPress: async () => {
                        const { error: membershipError } = await supabase.from('library_members').upsert(
                            [{ library_id: libraryInvite.library_id, user_id: currentUser.id, role: 'viewer' }],
                            { onConflict: 'library_id,user_id' }
                        );

                        if (membershipError) {
                            Alert.alert('Error', 'Could not join library: ' + membershipError.message);
                            return;
                        }

                        await supabase.from('pending_shares').delete()
                            .eq('receiver_email', currentUser.email)
                            .eq('status', `library_invite:${libraryInvite.id}`);
                        await supabase.from('library_invites').delete()
                            .eq('id', libraryInvite.id);

                        await reloadMemories();
                        Alert.alert('Success', 'Library added to your account.');
                        if (remainingInvites > 0) checkForIncomingShares();
                    },
                },
            ]
        );
    }, [reloadMemories]);

    return { handleShareSubmit, shareCustomFolder, checkForIncomingShares };
}
