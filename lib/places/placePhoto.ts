/** Google photo_reference values are not URLs. Brave pictures already are. */
export function placePhotoUri(
    reference: string | null | undefined,
    googleApiKey: string | undefined,
    maxWidth = 1200,
): string | null {
    const value = reference?.trim() ?? '';
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    if (!googleApiKey) return null;
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photo_reference=${encodeURIComponent(value)}&key=${googleApiKey}`;
}
