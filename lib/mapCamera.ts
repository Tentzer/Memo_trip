/**
 * Bottom-anchored memo markers (anchor y=1) place the coordinate at the pin tip.
 * Centering the map on that lat/lng puts the avatar above the viewport center.
 * Shift the camera slightly south so the marker bubble reads as centered.
 */
export function latitudeForMarkerViewportCenter(
    markerLat: number,
    latitudeDelta: number,
    ratio = 0.22,
): number {
    return markerLat - latitudeDelta * ratio;
}
