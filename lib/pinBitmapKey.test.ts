import { describe, expect, it } from '@jest/globals';
import {
    bitmapUriForMarker,
    peekPinBitmap,
    pinBitmapCachePath,
    placeholderBitmapUri,
    rememberPinBitmap,
} from '@/lib/pinBitmapCache';
import {
    PIN_BITMAP_PLACEHOLDER_KEY,
    clusterBitmapKey,
    clusterCountBucket,
    pinBitmapFileName,
    pinBitmapKey,
} from '@/lib/pinBitmapKey';

describe('pin bitmap keys', () => {
    it('changes the pin key when the photo, badge, or selected state changes', () => {
        const base = {
            memoryId: 'memo-1',
            imageUri: 'https://cdn/a.jpg',
            badge: 'cafe' as const,
            variant: 'owned' as const,
            selected: false,
            video: false,
        };
        const first = pinBitmapKey(base);
        expect(pinBitmapKey(base)).toBe(first);
        expect(pinBitmapKey({ ...base, imageUri: 'https://cdn/b.jpg' })).not.toBe(first);
        expect(pinBitmapKey({ ...base, badge: null })).not.toBe(first);
        expect(pinBitmapKey({ ...base, selected: true })).not.toBe(first);
        expect(pinBitmapKey({ ...base, memoryId: 'memo-2' })).not.toBe(first);
    });

    it('buckets cluster bitmaps by the displayed count and style', () => {
        expect(clusterCountBucket(2)).toBe('2');
        expect(clusterCountBucket(140)).toBe('99+');
        const shared = {
            count: 140,
            imageUri: 'https://cdn/new.jpg',
            frame: 'owned' as const,
            ring: 'mixed' as const,
            variant: 'shared' as const,
        };
        expect(clusterBitmapKey(shared)).toBe(clusterBitmapKey({ ...shared, count: 250 }));
        expect(clusterBitmapKey(shared)).not.toBe(clusterBitmapKey({ ...shared, ring: 'owned' }));
        expect(clusterBitmapKey(shared)).not.toBe(clusterBitmapKey({ ...shared, imageUri: 'https://cdn/other.jpg' }));
    });

    it('uses one stable file name and one placeholder uri', () => {
        expect(pinBitmapFileName('pin|a')).toBe(pinBitmapFileName('pin|a'));
        expect(pinBitmapFileName('pin|a')).not.toBe(pinBitmapFileName('pin|b'));
        expect(pinBitmapCachePath('file:///cache', 'pin|a')).toBe(
            `file:///cache/pin-bitmaps/${pinBitmapFileName('pin|a')}`,
        );
        expect(placeholderBitmapUri()).toBe(placeholderBitmapUri());
        expect(placeholderBitmapUri().startsWith('data:image/png;base64,')).toBe(true);
        expect(PIN_BITMAP_PLACEHOLDER_KEY).toBe('placeholder:v1');
    });

    it('serves a cached png before the placeholder', () => {
        const key = pinBitmapKey({
            memoryId: 'cached',
            imageUri: 'https://cdn/c.jpg',
            badge: null,
            variant: 'shared',
            selected: false,
            video: false,
        });
        expect(bitmapUriForMarker(key)).toBe(placeholderBitmapUri());
        rememberPinBitmap(key, 'file:///pins/cached.png');
        expect(peekPinBitmap(key)).toBe('file:///pins/cached.png');
        expect(bitmapUriForMarker(key)).toBe('file:///pins/cached.png');
    });
});
