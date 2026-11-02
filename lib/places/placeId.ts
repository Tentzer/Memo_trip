/** Brave Place Search ids look like `loc4G4LX7WYT25AUBNMX`. */
const BRAVE_PLACE_ID = /^loc[A-Za-z0-9]+$/;

/** Synthetic id when a Brave result has no id. Includes title, coordinates, and address. */
const SYNTHETIC_BRAVE_PLACE_ID = /^brave:/;

/**
 * Google place ids are kept working when Brave is the active provider.
 * Anything that is not a Brave id is treated as a Google place id.
 */
export function isGooglePlaceId(placeId: string | null | undefined): boolean {
    const id = placeId?.trim() ?? '';
    if (!id) return false;
    if (BRAVE_PLACE_ID.test(id) || SYNTHETIC_BRAVE_PLACE_ID.test(id)) return false;
    return true;
}

export function isBravePlaceId(placeId: string | null | undefined): boolean {
    const id = placeId?.trim() ?? '';
    return BRAVE_PLACE_ID.test(id) || SYNTHETIC_BRAVE_PLACE_ID.test(id);
}

export function syntheticBravePlaceId(
    title: string,
    latitude: number,
    longitude: number,
    address: string,
): string {
    const name = title.trim().toLowerCase();
    const placeAddress = address.trim().toLowerCase();
    return `brave:${name}:${latitude.toFixed(5)}:${longitude.toFixed(5)}:${placeAddress}`;
}
