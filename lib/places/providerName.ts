export type PlacesProviderName = 'brave' | 'google';

/** Default is Brave. `google` is the only other accepted value. */
export function parsePlacesProvider(raw: string | undefined | null): PlacesProviderName {
    return raw?.trim().toLowerCase() === 'google' ? 'google' : 'brave';
}

export const PLACE_SEARCH_DEBOUNCE_MS = 300;
