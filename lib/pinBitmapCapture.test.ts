import { describe, expect, it } from '@jest/globals';
import {
    PIN_BITMAP_CAPTURE_ATTEMPTS,
    PIN_BITMAP_POINT_HEIGHT,
    PIN_BITMAP_POINT_WIDTH,
    decidePinCapture,
    markerPointSizeForBitmap,
    pinBitmapCaptureSize,
    pinBitmapPixelSize,
} from '@/lib/pinBitmapCapture';

describe('pin bitmap capture size', () => {
    it('captures at the pin point size so a 3x screen stays 72 by 86', () => {
        const capture = pinBitmapCaptureSize();
        expect(capture).toEqual({
            width: PIN_BITMAP_POINT_WIDTH,
            height: PIN_BITMAP_POINT_HEIGHT,
        });
        expect(capture.width).toBe(72);
        expect(capture.height).toBe(86);

        const pixels = pinBitmapPixelSize(3);
        expect(pixels).toEqual({ width: 216, height: 258 });

        const displayed = markerPointSizeForBitmap(pixels.width, pixels.height, 3);
        expect(displayed).toEqual({ width: 72, height: 86 });
    });

    it('retries a missed photo once, then captures the ring without it', () => {
        expect(decidePinCapture({
            attempt: 1,
            maxAttempts: PIN_BITMAP_CAPTURE_ATTEMPTS,
            photoLoaded: false,
            hasPhoto: true,
        })).toBe('retry');
        expect(decidePinCapture({
            attempt: 2,
            maxAttempts: PIN_BITMAP_CAPTURE_ATTEMPTS,
            photoLoaded: false,
            hasPhoto: true,
        })).toBe('capture-fallback');
        expect(decidePinCapture({
            attempt: 1,
            maxAttempts: PIN_BITMAP_CAPTURE_ATTEMPTS,
            photoLoaded: true,
            hasPhoto: true,
        })).toBe('capture');
        expect(decidePinCapture({
            attempt: 1,
            maxAttempts: PIN_BITMAP_CAPTURE_ATTEMPTS,
            photoLoaded: false,
            hasPhoto: false,
        })).toBe('capture');
    });

    it('does not multiply the capture options by the screen scale', () => {
        const capture = pinBitmapCaptureSize();
        expect(capture.width).toBeLessThan(pinBitmapPixelSize(3).width);
        expect(capture.height).toBeLessThan(pinBitmapPixelSize(2).height);
    });
});
