export type ThemeMode = 'light' | 'dark';

export type AppTheme = {
    mode: ThemeMode;
    isDark: boolean;
    colors: {
        background: string;
        backgroundSoft: string;
        surface: string;
        surfaceElevated: string;
        surfaceMuted: string;
        input: string;
        text: string;
        textSecondary: string;
        textMuted: string;
        border: string;
        borderStrong: string;
        accent: string;
        accentSoft: string;
        accentText: string;
        danger: string;
        dangerSoft: string;
        success: string;
        successSoft: string;
        warning: string;
        warningSoft: string;
        overlay: string;
        shadow: string;
        handle: string;
        placeholder: string;
        tabInactive: string;
        disabled: string;
    };
};

export const lightTheme: AppTheme = {
    mode: 'light',
    isDark: false,
    colors: {
        background: '#F8FAFC',
        backgroundSoft: '#EEF4FF',
        surface: '#FFFFFF',
        surfaceElevated: '#FFFFFF',
        surfaceMuted: '#F8FAFC',
        input: '#F8FAFC',
        text: '#0F172A',
        textSecondary: '#334155',
        textMuted: '#64748B',
        border: '#E2E8F0',
        borderStrong: '#CBD5E1',
        accent: '#2563EB',
        accentSoft: '#EFF6FF',
        accentText: '#1D4ED8',
        danger: '#DC2626',
        dangerSoft: '#FEF2F2',
        success: '#16A34A',
        successSoft: '#F0FDF4',
        warning: '#F59E0B',
        warningSoft: '#FFFBEB',
        overlay: 'rgba(15, 23, 42, 0.45)',
        shadow: '#0F172A',
        handle: '#CBD5E1',
        placeholder: '#94A3B8',
        tabInactive: '#94A3B8',
        disabled: '#CBD5E1',
    },
};

export const darkTheme: AppTheme = {
    mode: 'dark',
    isDark: true,
    colors: {
        background: '#07111F',
        backgroundSoft: '#0B1728',
        surface: '#0F1B2D',
        surfaceElevated: '#13233A',
        surfaceMuted: '#172A44',
        input: '#111F34',
        text: '#F8FAFC',
        textSecondary: '#CBD5E1',
        textMuted: '#94A3B8',
        border: '#25364F',
        borderStrong: '#334155',
        accent: '#60A5FA',
        accentSoft: '#12345A',
        accentText: '#93C5FD',
        danger: '#F87171',
        dangerSoft: '#3A1720',
        success: '#34D399',
        successSoft: '#123224',
        warning: '#FBBF24',
        warningSoft: '#3A2B12',
        overlay: 'rgba(2, 6, 23, 0.72)',
        shadow: '#000000',
        handle: '#475569',
        placeholder: '#64748B',
        tabInactive: '#64748B',
        disabled: '#334155',
    },
};

export const themes: Record<ThemeMode, AppTheme> = {
    light: lightTheme,
    dark: darkTheme,
};
