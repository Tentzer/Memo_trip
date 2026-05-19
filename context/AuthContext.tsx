import { supabase } from '@/lib/supabase';
import { refreshShareExtensionAuthToken, syncShareExtensionAuthToken } from '@/lib/shareExtensionAuthSync';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Initial Session Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            syncShareExtensionAuthToken(session?.access_token ?? null);
            setLoading(false);
        });

        // Listen for Auth Changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            syncShareExtensionAuthToken(session?.access_token ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        syncShareExtensionAuthToken(session?.access_token ?? null);
    }, [session?.access_token]);

    // Keep the share extension token fresh whenever the app returns to foreground.
    useEffect(() => {
        const onAppStateChange = (nextState: AppStateStatus) => {
            if (nextState === 'active') {
                void refreshShareExtensionAuthToken();
            }
        };
        const sub = AppState.addEventListener('change', onAppStateChange);
        return () => sub.remove();
    }, []);

    // The "Delegated" Logout Function
    const logout = async () => {
        syncShareExtensionAuthToken(null);
        setUser(null);
        setSession(null);
        const { error } = await supabase.auth.signOut();
        if (error) console.error("Logout error:", error.message);
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
};