import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

const THEME_STORAGE_KEY = 'memo-trip-theme';

type AppTheme = {
    colors: {
        background: string;
        text: string;
        card: string;
        border: string;
    };
};

type ThemeContextValue = {
    isDarkMode: boolean;
    theme: AppTheme;
    setIsDarkMode: (value: boolean) => void;
    toggleDarkMode: () => void;
};

const lightTheme: AppTheme = {
    colors: {
        background: '#f8fafc',
        text: '#0f172a',
        card: '#ffffff',
        border: '#e2e8f0',
    },
};

const darkTheme: AppTheme = {
    colors: {
        background: '#0f172a',
        text: '#f8fafc',
        card: '#1e293b',
        border: '#334155',
    },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [isDarkMode, setIsDarkModeState] = useState(systemScheme === 'dark');
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        void (async () => {
            try {
                const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
                if (stored === 'dark') setIsDarkModeState(true);
                if (stored === 'light') setIsDarkModeState(false);
            } finally {
                setHydrated(true);
            }
        })();
    }, []);

    const setIsDarkMode = useCallback((value: boolean) => {
        setIsDarkModeState(value);
        void AsyncStorage.setItem(THEME_STORAGE_KEY, value ? 'dark' : 'light');
    }, []);

    const toggleDarkMode = useCallback(() => {
        setIsDarkMode(!isDarkMode);
    }, [isDarkMode, setIsDarkMode]);

    const theme = isDarkMode ? darkTheme : lightTheme;

    const value = useMemo(
        () => ({ isDarkMode, theme, setIsDarkMode, toggleDarkMode }),
        [isDarkMode, theme, setIsDarkMode, toggleDarkMode],
    );

    if (!hydrated) {
        return null;
    }

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useAppTheme must be used within ThemeProvider');
    }
    return context;
}
