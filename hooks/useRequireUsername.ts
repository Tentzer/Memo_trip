import { fetchProfileUsername } from '@/lib/username';
import { useAuth } from '@/context/AuthContext';
import { useCallback, useEffect, useState } from 'react';

export function useRequireUsername() {
    const { user, loading: authLoading } = useAuth();
    const [username, setUsername] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    const [hasChecked, setHasChecked] = useState(false);

    const refresh = useCallback(async () => {
        if (!user?.id) {
            setUsername(null);
            setChecking(false);
            setHasChecked(false);
            return;
        }
        setChecking(true);
        const profileUsername = await fetchProfileUsername(user.id);
        setUsername(profileUsername);
        setHasChecked(true);
        setChecking(false);
    }, [user?.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const needsUsername = Boolean(user && hasChecked && !checking && !authLoading && !username);

    return {
        username,
        needsUsername,
        checking: checking || authLoading || (Boolean(user) && !hasChecked),
        refresh,
    };
}
