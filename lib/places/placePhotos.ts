import { placePhotoUri } from './placePhoto.ts';

/** One gallery image. `thumb` is the small URL; `full` is the large one. */
export interface PlacePhoto {
    thumb: string;
    full: string;
}

export const MAX_PLACE_PHOTOS = 5;
export const PLACE_PHOTO_THUMB_WIDTH = 400;
export const PLACE_PHOTO_FULL_WIDTH = 1200;

export interface BravePicture {
    src?: string;
    /** Full-size image. Brave `src` is the imgs.search.brave.com proxy. */
    original?: string;
    logo?: boolean;
    duplicated?: boolean;
}

/**
 * Brave `src` is the proxied thumbnail. `original` is the full image when Brave sends one.
 */
export function mapBravePlacePhotos(pictures: BravePicture[] | null | undefined): PlacePhoto[] {
    const photos: PlacePhoto[] = [];
    for (const picture of pictures ?? []) {
        const thumb = picture.src?.trim() ?? '';
        if (!thumb || picture.logo || picture.duplicated) continue;
        const full = picture.original?.trim() || thumb;
        photos.push({ thumb, full });
        if (photos.length >= MAX_PLACE_PHOTOS) break;
    }
    return photos;
}

/** Google photo_reference values become thumb and full URLs through the existing helper. */
export function mapGooglePhotoReferences(
    references: string[] | null | undefined,
    googleApiKey: string | undefined,
): PlacePhoto[] {
    const photos: PlacePhoto[] = [];
    for (const reference of references ?? []) {
        const thumb = placePhotoUri(reference, googleApiKey, PLACE_PHOTO_THUMB_WIDTH);
        const full = placePhotoUri(reference, googleApiKey, PLACE_PHOTO_FULL_WIDTH);
        if (!thumb || !full) continue;
        photos.push({ thumb, full });
        if (photos.length >= MAX_PLACE_PHOTOS) break;
    }
    return photos;
}
