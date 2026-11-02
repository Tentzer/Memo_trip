import { describe, expect, it } from '@jest/globals';
import { paintedMarkerPhase, rememberPaintedMarker } from '@/lib/markerImageCache';

describe('painted marker cache', () => {
    it('reuses the painted phase for the same memory and photo', () => {
        rememberPaintedMarker('memo-1', 'https://cdn/a.jpg', 'loaded');
        expect(paintedMarkerPhase('memo-1', 'https://cdn/a.jpg')).toBe('loaded');
        expect(paintedMarkerPhase('memo-1', 'https://cdn/b.jpg')).toBeNull();
        expect(paintedMarkerPhase('memo-2', 'https://cdn/a.jpg')).toBeNull();
    });
});