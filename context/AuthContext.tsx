import { setShareExtensionAccessToken } from '@/lib/shareExtensionAuthSync';
import { supabase } from '@/lib/supabase';
import { Session, User } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';

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
        const applySession = async (next: Session | null) => {
            setSession(next);
            setUser(next?.user ?? null);
            setLoading(false);
            if (next?.access_token) {
                await supabase.realtime.setAuth(next.access_token);
            }
            setShareExtensionAccessToken(next?.access_token ?? null);
        };

        void supabase.auth.getSession().then(({ data: { session } }) => applySession(session));

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            void applySession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    const logout = async () => {
        setUser(null);
        setSession(null);
        setShareExtensionAccessToken(null);
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
