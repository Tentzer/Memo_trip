import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type LibrariesOverlayContextValue = {
    visible: boolean;
    open: () => void;
    close: () => void;
};

const LibrariesOverlayContext = createContext<LibrariesOverlayContextValue | undefined>(undefined);

export function LibrariesOverlayProvider({ children }: { children: React.ReactNode }) {
    const [visible, setVisible] = useState(false);

    const open = useCallback(() => {
        setVisible(true);
    }, []);

    const close = useCallback(() => {
        setVisible(false);
    }, []);

    const value = useMemo<LibrariesOverlayContextValue>(() => ({
        visible,
        open,
        close,
    }), [visible, open, close]);

    return (
        <LibrariesOverlayContext.Provider value={value}>
            {children}
        </LibrariesOverlayContext.Provider>
    );
}

export function useLibrariesOverlay() {
    const context = useContext(LibrariesOverlayContext);
    if (!context) {
        throw new Error('useLibrariesOverlay must be used within a LibrariesOverlayProvider');
    }
    return context;
}
