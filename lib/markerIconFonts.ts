import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Font from 'expo-font';

const ICON_FONTS = {
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
};

let pending: Promise<void> | null = null;

export function markerIconFontsReady(): boolean {
    return Object.keys(ICON_FONTS).every((family) => Font.isLoaded(family));
}

/** Load the same icon fonts PlaceCategoryIcon draws, once, before a pin snapshot. */
export function ensureMarkerIconFonts(): Promise<void> {
    if (markerIconFontsReady()) return Promise.resolve();
    if (!pending) {
        pending = Font.loadAsync(ICON_FONTS).then(() => undefined).catch(() => undefined).finally(() => {
            pending = null;
        });
    }
    return pending;
}
