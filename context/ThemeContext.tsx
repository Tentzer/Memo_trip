import { AppTheme, ThemeMode, themes } from '@/constants/theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const THEME_STORAGE_KEY = 'memo-trip-theme-mode';

type ThemeContextValue = {
    isDarkMode: boolean;
    setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>>;
    theme: AppTheme;
    mode: ThemeMode;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>('light');

    useEffect(() => {
        let mounted = true;

        AsyncStorage.getItem(THEME_STORAGE_KEY)
            .then((storedMode) => {
                if (!mounted || (storedMode !== 'light' && storedMode !== 'dark')) return;
                setMode(storedMode);
            })
            .catch(() => {
                // Theme persistence should never block rendering.
            });

        return () => {
            mounted = false;
        };
    }, []);

    const persistMode = useCallback((nextMode: ThemeMode) => {
        AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode).catch(() => {
            // Ignore storage failures; the in-memory theme still updates immediately.
        });
    }, []);

    const setIsDarkMode: React.Dispatch<React.SetStateAction<boolean>> = useCallback((value) => {
        setMode((previousMode) => {
            const previousValue = previousMode === 'dark';
            const nextValue = typeof value === 'function' ? value(previousValue) : value;
            const nextMode = nextValue ? 'dark' : 'light';
            persistMode(nextMode);
            return nextMode;
        });
    }, [persistMode]);

    const theme = themes[mode];

    const value = useMemo<ThemeContextValue>(() => ({
        isDarkMode: mode === 'dark',
        setIsDarkMode,
        theme,
        mode,
    }), [mode, setIsDarkMode, theme]);

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useAppTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useAppTheme must be used within a ThemeProvider');
    }
    return context;
}
