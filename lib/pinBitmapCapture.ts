/** Layout size of a map pin, in points. Matches markerStyles.markerPinWrapper. */
export const PIN_BITMAP_POINT_WIDTH = 72;
export const PIN_BITMAP_POINT_HEIGHT = 86;

/** How long to wait for a photo before trying again or capturing the ring alone. */
export const PIN_BITMAP_CAPTURE_TIMEOUT_MS = 800;
export const PIN_BITMAP_CAPTURE_ATTEMPTS = 2;
/** Coalesce marker image updates so a burst of finished captures is one commit. */
export const PIN_BITMAP_FLUSH_MS = 100;

export type PinBitmapSize = {
    width: number;
    height: number;
};

/**
 * Size passed to react-native-view-shot.
 *
 * iOS RNViewShot captures with UIGraphicsBeginImageContextWithOptions(size, NO, 0).
 * Those width and height values are points, and the PNG pixel size is
 * points times the screen scale. Passing a size that is already multiplied
 * by PixelRatio writes a bitmap one screen-scale too large.
 *
 * AIRGoogleMapMarker then loads the file through RCTImageLoader at
 * RCTScreenScale() and sets the marker frame to image.size (pixels / scale).
 * Point-sized capture options therefore land on the map at 72 by 86 points.
 */
export function pinBitmapCaptureSize(): PinBitmapSize {
    return {
        width: PIN_BITMAP_POINT_WIDTH,
        height: PIN_BITMAP_POINT_HEIGHT,
    };
}

/** Pixel size of the PNG view-shot writes for a given screen scale. */
export function pinBitmapPixelSize(screenScale: number): PinBitmapSize {
    const scale = screenScale > 0 ? screenScale : 1;
    return {
        width: Math.round(PIN_BITMAP_POINT_WIDTH * scale),
        height: Math.round(PIN_BITMAP_POINT_HEIGHT * scale),
    };
}

/**
 * Point size AIRGoogleMapMarker uses for that PNG.
 * image.size is pixels divided by the scale passed to ImageLoader.
 */
export type PinCaptureDecision = 'capture' | 'retry' | 'capture-fallback';

/**
 * Called when a photo attempt ends, either because it loaded or because it
 * timed out or failed. A loaded photo is captured. Otherwise one retry is
 * allowed, then the ring is captured without the photo so the queue moves on.
 */
export function decidePinCapture(input: {
    attempt: number;
    maxAttempts: number;
    photoLoaded: boolean;
    hasPhoto: boolean;
}): PinCaptureDecision {
    if (!input.hasPhoto || input.photoLoaded) return 'capture';
    if (input.attempt < input.maxAttempts) return 'retry';
    return 'capture-fallback';
}

export function markerPointSizeForBitmap(
    pixelWidth: number,
    pixelHeight: number,
    screenScale: number,
): PinBitmapSize {
    const scale = screenScale > 0 ? screenScale : 1;
    return {
        width: pixelWidth / scale,
        height: pixelHeight / scale,
    };
}
