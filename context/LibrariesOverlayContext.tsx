import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

type LibrariesOverlayContextValue = {
    visible: boolean;
    open: () => void;
    close: () => void;
    /** Sheet offset in px. 0 is open; `sheetTravel` is closed. The tab bar reads this on the UI thread. */
    sheetTranslateY: SharedValue<number>;
    sheetTravel: SharedValue<number>;
};

const LibrariesOverlayContext = createContext<LibrariesOverlayContextValue | undefined>(undefined);
const LibrariesOverlayActionsContext = createContext<Pick<LibrariesOverlayContextValue, 'open' | 'close'> | undefined>(undefined);

export function LibrariesOverlayProvider({ children }: { children: React.ReactNode }) {
    const [visible, setVisible] = useState(false);
    const sheetTranslateY = useSharedValue(1600);
    const sheetTravel = useSharedValue(1600);

    const open = useCallback(() => {
        setVisible(true);
    }, []);

    const close = useCallback(() => {
        setVisible(false);
    }, []);

    const actions = useMemo(() => ({ open, close }), [open, close]);
    const value = useMemo<LibrariesOverlayContextValue>(() => ({
        visible,
        open,
        close,
        sheetTranslateY,
        sheetTravel,
    }), [visible, open, close, sheetTranslateY, sheetTravel]);

    return (
        <LibrariesOverlayActionsContext.Provider value={actions}>
            <LibrariesOverlayContext.Provider value={value}>
                {children}
            </LibrariesOverlayContext.Provider>
        </LibrariesOverlayActionsContext.Provider>
    );
}

/** Stable open/close. Does not re-render when the sheet visibility changes. */
export function useLibrariesOverlayActions() {
    const context = useContext(LibrariesOverlayActionsContext);
    if (!context) {
        throw new Error('useLibrariesOverlay must be used within a LibrariesOverlayProvider');
    }
    return context;
}

export function useLibrariesOverlay() {
    const context = useContext(LibrariesOverlayContext);
    if (!context) {
        throw new Error('useLibrariesOverlay must be used within a LibrariesOverlayProvider');
    }
    return context;
}
