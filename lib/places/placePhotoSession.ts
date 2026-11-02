import type { PlacePhoto } from './placePhotos.ts';

const photosByPlaceId = new Map<string, PlacePhoto[]>();
const placeIdByLookup = new Map<string, string>();

export interface PlacePhotoLookup {
    title?: string | null;
    latitude: number;
    longitude: number;
    placeId?: string | null;
}

export function placePhotoLookupKey(lookup: PlacePhotoLookup): string {
    const title = lookup.title?.trim().toLowerCase() ?? '';
    const lat = Number.isFinite(lookup.latitude) ? lookup.latitude.toFixed(5) : '';
    const lng = Number.isFinite(lookup.longitude) ? lookup.longitude.toFixed(5) : '';
    return `${title}|${lat}|${lng}`;
}

export function readSessionPlacePhotos(lookup: PlacePhotoLookup): PlacePhoto[] | undefined {
    const placeId = lookup.placeId?.trim();
    if (placeId && photosByPlaceId.has(placeId)) {
        return photosByPlaceId.get(placeId);
    }
    const cachedId = placeIdByLookup.get(placePhotoLookupKey(lookup));
    if (cachedId && photosByPlaceId.has(cachedId)) {
        return photosByPlaceId.get(cachedId);
    }
    return undefined;
}

export function rememberSessionPlacePhotos(
    placeId: string,
    photos: PlacePhoto[],
    lookup?: PlacePhotoLookup,
): void {
    const id = placeId.trim();
    if (!id) return;
    photosByPlaceId.set(id, photos);
    if (lookup) placeIdByLookup.set(placePhotoLookupKey(lookup), id);
}

export function clearPlacePhotoSession(): void {
    photosByPlaceId.clear();
    placeIdByLookup.clear();
}
